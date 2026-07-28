const express = require('express');
const router = express.Router();
const multer = require('multer');
const Catalog = require('../models/Catalog');
const { auth } = require('../middleware/auth');
const { checkPerm } = require('../middleware/auth');
const { USE_S3, uploadBuffer, getPresignedUrl, deleteObject } = require('../services/s3Service');
const path = require('path');
const fs = require('fs');

const IMG_UPLOAD_DIR = path.join(__dirname, '../../uploads/catalog');
const imgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

const VALID_TYPES = ['puerto', 'aduana', 'aeropuerto', 'naviera', 'aerolinea', 'transportista', 'incoterm', 'contenedor', 'ruta_frecuente', 'pais', 'ciudad'];

// GET /api/catalog — todos los registros (con filtro por tipo)
router.get('/', auth, async (req, res) => {
  try {
    const { type, search, active = 'true' } = req.query;
    const filter = {};
    if (type && VALID_TYPES.includes(type)) filter.type = type;
    if (active !== 'all') filter.isActive = active !== 'false';
    if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const items = await Catalog.find(filter).sort({ type: 1, order: 1, name: 1 }).lean();
    res.json({ success: true, data: items });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/catalog/types — lista de tipos disponibles
router.get('/types', auth, (req, res) => {
  res.json({ success: true, data: VALID_TYPES });
});

// POST /api/catalog — crear elemento (gerencia o admin)
router.post('/', auth, checkPerm('catalog.edit'), async (req, res) => {
  try {
    const { type, code, name, country, region, extra, order } = req.body;
    if (!type || !name) return res.status(400).json({ success: false, message: 'type y name son requeridos' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ success: false, message: 'Tipo inválido' });

    const item = await Catalog.create({ type, code, name, country, region, extra, order: order || 0, createdBy: req.user._id });
    res.status(201).json({ success: true, data: item });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// PUT /api/catalog/:id — actualizar
router.put('/:id', auth, checkPerm('catalog.edit'), async (req, res) => {
  try {
    const { type, code, name, country, region, extra, order, isActive } = req.body;
    const item = await Catalog.findByIdAndUpdate(
      req.params.id,
      { type, code, name, country, region, extra, order, isActive },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: item });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/catalog/:id — desactivar (soft delete)
router.delete('/:id', auth, checkPerm('catalog.edit'), async (req, res) => {
  try {
    await Catalog.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/catalog/:id/image — upload image for catalog item
router.post('/:id/image', auth, checkPerm('catalog.edit'), imgUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió imagen' });
    const item = await Catalog.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item no encontrado' });

    const filename = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    let imageUrl;

    if (USE_S3) {
      const key = `catalog/${req.params.id}/${filename}`;
      await uploadBuffer(req.file.buffer, key, req.file.mimetype);
      imageUrl = await getPresignedUrl(key, 3600 * 24 * 365); // 1 year presigned (or use public bucket)
      item.imageKey = key;
    } else {
      if (!fs.existsSync(IMG_UPLOAD_DIR)) fs.mkdirSync(IMG_UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMG_UPLOAD_DIR, filename), req.file.buffer);
      imageUrl = `/uploads/catalog/${filename}`;
      item.imageKey = filename;
    }

    item.imageUrl = imageUrl;
    await item.save();
    res.json({ success: true, data: { imageUrl } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE /api/catalog/:id/image — remove image
router.delete('/:id/image', auth, checkPerm('catalog.edit'), async (req, res) => {
  try {
    const item = await Catalog.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false });
    if (item.imageKey) {
      if (USE_S3) await deleteObject(item.imageKey).catch(() => {});
      else {
        const fp = path.join(IMG_UPLOAD_DIR, item.imageKey);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    item.imageUrl = undefined;
    item.imageKey = undefined;
    await item.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/catalog/seed — sembrar datos iniciales (solo admin)
router.post('/seed', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false });
  try {
    const existing = await Catalog.countDocuments();
    if (existing > 0) return res.status(400).json({ success: false, message: 'El catálogo ya tiene datos. Usa PUT para actualizar.' });

    const seedData = [
      // Puertos marítimos
      { type: 'puerto', code: 'MZMZQ', name: 'Manzanillo', country: 'México', region: 'Pacífico' },
      { type: 'puerto', code: 'MXLZC', name: 'Lázaro Cárdenas', country: 'México', region: 'Pacífico' },
      { type: 'puerto', code: 'MXVER', name: 'Veracruz', country: 'México', region: 'Golfo' },
      { type: 'puerto', code: 'MXALT', name: 'Altamira', country: 'México', region: 'Golfo' },
      { type: 'puerto', code: 'CNSHA', name: 'Shanghai', country: 'China', region: 'Asia' },
      { type: 'puerto', code: 'CNNBO', name: 'Ningbo', country: 'China', region: 'Asia' },
      { type: 'puerto', code: 'CNCAN', name: 'Guangzhou (Yantian)', country: 'China', region: 'Asia' },
      { type: 'puerto', code: 'CNSZX', name: 'Shenzhen', country: 'China', region: 'Asia' },
      { type: 'puerto', code: 'USLAX', name: 'Los Ángeles', country: 'EUA', region: 'Norteamérica' },
      { type: 'puerto', code: 'USLGB', name: 'Long Beach', country: 'EUA', region: 'Norteamérica' },
      { type: 'puerto', code: 'USHOU', name: 'Houston', country: 'EUA', region: 'Norteamérica' },
      { type: 'puerto', code: 'BRVIX', name: 'Vitória', country: 'Brasil', region: 'Suramérica' },
      { type: 'puerto', code: 'BRSSZ', name: 'Santos', country: 'Brasil', region: 'Suramérica' },
      { type: 'puerto', code: 'NLRTM', name: 'Rotterdam', country: 'Países Bajos', region: 'Europa' },
      { type: 'puerto', code: 'DEHAM', name: 'Hamburgo', country: 'Alemania', region: 'Europa' },
      { type: 'puerto', code: 'ESVLC', name: 'Valencia', country: 'España', region: 'Europa' },
      { type: 'puerto', code: 'KRPUS', name: 'Busan', country: 'Corea del Sur', region: 'Asia' },
      { type: 'puerto', code: 'JPOSA', name: 'Osaka', country: 'Japón', region: 'Asia' },
      { type: 'puerto', code: 'INBOM', name: 'Mumbai (JNPT)', country: 'India', region: 'Asia' },
      { type: 'puerto', code: 'SGSIN', name: 'Singapur', country: 'Singapur', region: 'Asia' },
      // Aduanas México
      { type: 'aduana', code: 'MX-MZQ', name: 'Aduana Manzanillo', country: 'México', region: 'Pacífico' },
      { type: 'aduana', code: 'MX-VER', name: 'Aduana Veracruz', country: 'México', region: 'Golfo' },
      { type: 'aduana', code: 'MX-MEX', name: 'Aduana Aeropuerto AICM', country: 'México', region: 'Centro' },
      { type: 'aduana', code: 'MX-LAR', name: 'Aduana Nuevo Laredo', country: 'México', region: 'Frontera Norte' },
      { type: 'aduana', code: 'MX-TIJ', name: 'Aduana Tijuana', country: 'México', region: 'Frontera Norte' },
      { type: 'aduana', code: 'MX-CJS', name: 'Aduana Ciudad Juárez', country: 'México', region: 'Frontera Norte' },
      { type: 'aduana', code: 'MX-MTY', name: 'Aduana Monterrey', country: 'México', region: 'Norte' },
      { type: 'aduana', code: 'MX-GDL', name: 'Aduana Guadalajara', country: 'México', region: 'Occidente' },
      // Aeropuertos
      { type: 'aeropuerto', code: 'MEX', name: 'AICM Ciudad de México', country: 'México', region: 'Centro' },
      { type: 'aeropuerto', code: 'GDL', name: 'Miguel Hidalgo Guadalajara', country: 'México', region: 'Occidente' },
      { type: 'aeropuerto', code: 'MTY', name: 'Mariano Escobedo Monterrey', country: 'México', region: 'Norte' },
      { type: 'aeropuerto', code: 'CUN', name: 'Cancún', country: 'México', region: 'Sureste' },
      { type: 'aeropuerto', code: 'LAX', name: 'Los Ángeles International', country: 'EUA', region: 'Norteamérica' },
      { type: 'aeropuerto', code: 'JFK', name: 'John F. Kennedy Nueva York', country: 'EUA', region: 'Norteamérica' },
      { type: 'aeropuerto', code: 'MIA', name: 'Miami International', country: 'EUA', region: 'Norteamérica' },
      { type: 'aeropuerto', code: 'ORD', name: 'O\'Hare Chicago', country: 'EUA', region: 'Norteamérica' },
      { type: 'aeropuerto', code: 'PVG', name: 'Pudong Shanghai', country: 'China', region: 'Asia' },
      { type: 'aeropuerto', code: 'HKG', name: 'Hong Kong International', country: 'Hong Kong', region: 'Asia' },
      { type: 'aeropuerto', code: 'AMS', name: 'Schiphol Amsterdam', country: 'Países Bajos', region: 'Europa' },
      { type: 'aeropuerto', code: 'FRA', name: 'Frankfurt Airport', country: 'Alemania', region: 'Europa' },
      // Navieras
      { type: 'naviera', code: 'MSC', name: 'MSC (Mediterranean Shipping Company)' },
      { type: 'naviera', code: 'MAERSK', name: 'Maersk Line' },
      { type: 'naviera', code: 'CMA', name: 'CMA CGM' },
      { type: 'naviera', code: 'COSCO', name: 'COSCO Shipping' },
      { type: 'naviera', code: 'ONE', name: 'Ocean Network Express (ONE)' },
      { type: 'naviera', code: 'HPL', name: 'Hapag-Lloyd' },
      { type: 'naviera', code: 'EVERGREEN', name: 'Evergreen Marine' },
      { type: 'naviera', code: 'YANG', name: 'Yang Ming Marine' },
      { type: 'naviera', code: 'HMM', name: 'HMM (Hyundai Merchant Marine)' },
      { type: 'naviera', code: 'ZIM', name: 'ZIM Integrated Shipping' },
      // Aerolíneas cargo
      { type: 'aerolinea', code: 'AM', name: 'Aeroméxico Cargo' },
      { type: 'aerolinea', code: 'FX', name: 'FedEx Express' },
      { type: 'aerolinea', code: 'UPS', name: 'UPS Airlines' },
      { type: 'aerolinea', code: 'CV', name: 'Cargolux' },
      { type: 'aerolinea', code: 'AA', name: 'American Airlines Cargo' },
      { type: 'aerolinea', code: 'LX', name: 'Swiss WorldCargo' },
      { type: 'aerolinea', code: 'CX', name: 'Cathay Pacific Cargo' },
      { type: 'aerolinea', code: 'QR', name: 'Qatar Airways Cargo' },
      { type: 'aerolinea', code: 'TK', name: 'Turkish Airlines Cargo' },
      // Incoterms 2020
      { type: 'incoterm', code: 'EXW', name: 'EXW — Ex Works', extra: { descripcion: 'Vendedor pone mercancía a disposición en su local' } },
      { type: 'incoterm', code: 'FCA', name: 'FCA — Free Carrier', extra: { descripcion: 'Vendedor entrega al transportista designado por comprador' } },
      { type: 'incoterm', code: 'FAS', name: 'FAS — Free Alongside Ship', extra: { descripcion: 'Vendedor entrega al costado del buque (marítimo)' } },
      { type: 'incoterm', code: 'FOB', name: 'FOB — Free On Board', extra: { descripcion: 'Vendedor entrega a bordo del buque (marítimo)' } },
      { type: 'incoterm', code: 'CFR', name: 'CFR — Cost and Freight', extra: { descripcion: 'Vendedor paga flete hasta puerto destino (marítimo)' } },
      { type: 'incoterm', code: 'CIF', name: 'CIF — Cost, Insurance and Freight', extra: { descripcion: 'Vendedor paga flete + seguro hasta puerto destino' } },
      { type: 'incoterm', code: 'CPT', name: 'CPT — Carriage Paid To', extra: { descripcion: 'Vendedor paga flete hasta destino acordado (multimodal)' } },
      { type: 'incoterm', code: 'CIP', name: 'CIP — Carriage and Insurance Paid To', extra: { descripcion: 'Vendedor paga flete + seguro hasta destino (multimodal)' } },
      { type: 'incoterm', code: 'DAP', name: 'DAP — Delivered At Place', extra: { descripcion: 'Vendedor entrega en lugar acordado, sin descarga' } },
      { type: 'incoterm', code: 'DPU', name: 'DPU — Delivered at Place Unloaded', extra: { descripcion: 'Vendedor entrega descargada en lugar acordado' } },
      { type: 'incoterm', code: 'DDP', name: 'DDP — Delivered Duty Paid', extra: { descripcion: 'Vendedor entrega con todos los gastos incluidos' } },
      // Tipos de contenedor
      { type: 'contenedor', code: '20GP', name: "20' General Purpose (Dry)", extra: { teus: 1, capacidadM3: 33.2 } },
      { type: 'contenedor', code: '40GP', name: "40' General Purpose (Dry)", extra: { teus: 2, capacidadM3: 67.7 } },
      { type: 'contenedor', code: '40HC', name: "40' High Cube", extra: { teus: 2, capacidadM3: 76.4 } },
      { type: 'contenedor', code: '20RF', name: "20' Reefer (Refrigerado)", extra: { teus: 1, temperatura: '-25°C a +25°C' } },
      { type: 'contenedor', code: '40RF', name: "40' Reefer High Cube", extra: { teus: 2, temperatura: '-25°C a +25°C' } },
      { type: 'contenedor', code: '20OT', name: "20' Open Top", extra: { teus: 1 } },
      { type: 'contenedor', code: '40OT', name: "40' Open Top", extra: { teus: 2 } },
      { type: 'contenedor', code: '20FR', name: "20' Flat Rack", extra: { teus: 1 } },
      { type: 'contenedor', code: '45HC', name: "45' High Cube", extra: { teus: 2.25, capacidadM3: 86 } },
    ];

    await Catalog.insertMany(seedData.map(d => ({ ...d, isActive: true })));
    res.json({ success: true, message: `${seedData.length} registros sembrados en el catálogo`, count: seedData.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
