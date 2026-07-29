const express = require('express');
const router = express.Router();
const Mailbox = require('../models/Mailbox');
const { auth, checkPerm } = require('../middleware/auth');
const mailboxService = require('../services/mailboxService');

router.use(auth);

const POPULATE = [
  { path: 'assignedTo', select: 'name email role' },
  { path: 'sharedWith', select: 'name email role' },
];

// GET /api/mailboxes — buzones que el usuario puede usar como remitente.
// Los admin ven todos; el resto solo los propios y los compartidos con él.
router.get('/', async (req, res) => {
  try {
    const mailboxes = await Mailbox.find(mailboxService.visibleFilter(req.user))
      .populate(POPULATE)
      .sort({ isDefault: -1, address: 1 });
    res.json({ success: true, data: mailboxes, domain: mailboxService.inboundDomain() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/mailboxes/all — inventario completo para la pantalla de administración.
router.get('/all', checkPerm('mailboxes.manage'), async (req, res) => {
  try {
    const mailboxes = await Mailbox.find().populate(POPULATE).sort({ address: 1 });
    res.json({ success: true, data: mailboxes, domain: mailboxService.inboundDomain() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Solo puede haber un buzón por defecto: al marcar uno se desmarca el resto.
async function clearOtherDefaults(exceptId) {
  await Mailbox.updateMany({ _id: { $ne: exceptId }, isDefault: true }, { isDefault: false });
}

// POST /api/mailboxes — crear una dirección nueva del dominio.
router.post('/', checkPerm('mailboxes.manage'), async (req, res) => {
  try {
    const domain = mailboxService.inboundDomain();
    if (!domain) {
      return res.status(400).json({
        success: false,
        message: 'Falta INBOUND_EMAIL_DOMAIN: configura el dominio de buzones en Integraciones → Resend',
      });
    }

    const localPart = String(req.body.localPart || '').trim().toLowerCase();
    if (!mailboxService.isValidLocalPart(localPart)) {
      return res.status(400).json({
        success: false,
        message: 'Nombre inválido: usa letras, números, punto, guion y guion bajo (sin "+")',
      });
    }

    const address = `${localPart}@${domain}`;
    if (await Mailbox.exists({ address })) {
      return res.status(409).json({ success: false, message: `${address} ya existe` });
    }

    const mailbox = await Mailbox.create({
      address,
      displayName: String(req.body.displayName || localPart).trim(),
      assignedTo: req.body.assignedTo || null,
      sharedWith: req.body.sharedWith || [],
      signature: req.body.signature || '',
      forwardTo: req.body.forwardTo || '',
      isDefault: !!req.body.isDefault,
      createdBy: req.user._id,
    });
    if (mailbox.isDefault) await clearOtherDefaults(mailbox._id);

    await mailbox.populate(POPULATE);
    res.status(201).json({ success: true, data: mailbox });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/mailboxes/:id — reasignar, renombrar, firma, reenvío.
// La dirección no se cambia: reescribirla rompería el hilo de los correos ya
// enviados, que traen el Reply-To viejo. Para cambiarla se crea otra.
router.put('/:id', checkPerm('mailboxes.manage'), async (req, res) => {
  try {
    const updates = {};
    for (const field of ['displayName', 'signature', 'forwardTo']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body.assignedTo !== undefined) updates.assignedTo = req.body.assignedTo || null;
    if (req.body.sharedWith !== undefined) updates.sharedWith = req.body.sharedWith || [];
    if (req.body.isActive !== undefined) updates.isActive = !!req.body.isActive;
    if (req.body.isDefault !== undefined) updates.isDefault = !!req.body.isDefault;

    const mailbox = await Mailbox.findByIdAndUpdate(req.params.id, updates, { new: true }).populate(POPULATE);
    if (!mailbox) return res.status(404).json({ success: false, message: 'Buzón no encontrado' });
    if (mailbox.isDefault) await clearOtherDefaults(mailbox._id);

    res.json({ success: true, data: mailbox });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/mailboxes/:id — desactiva en vez de borrar: los correos ya
// recibidos siguen apuntando a este buzón desde el historial del lead.
router.delete('/:id', checkPerm('mailboxes.manage'), async (req, res) => {
  try {
    const mailbox = await Mailbox.findByIdAndUpdate(
      req.params.id, { isActive: false, isDefault: false }, { new: true },
    );
    if (!mailbox) return res.status(404).json({ success: false, message: 'Buzón no encontrado' });
    res.json({ success: true, message: `${mailbox.address} desactivado` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
