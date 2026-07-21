/**
 * S3 Service — ACON CRM
 * Centralizes all S3 operations: upload, presigned download URL, delete.
 *
 * Required env vars:
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET
 *
 * Falls back to local disk storage when S3_BUCKET is not configured
 * (development / environments without S3 credentials).
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');

const USE_S3 = !!(process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID);

let s3;
if (USE_S3) {
  s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const BUCKET = process.env.S3_BUCKET;

/**
 * Upload a buffer/stream to S3.
 * @param {Buffer} buffer
 * @param {string} key       — S3 object key, e.g. 'leads/abc123/file.pdf'
 * @param {string} mimetype
 * @returns {Promise<string>} — The S3 key (used later to generate presigned URLs)
 */
async function uploadBuffer(buffer, key, mimetype) {
  if (!USE_S3) throw new Error('S3 not configured');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  return key;
}

/**
 * Generate a presigned GET URL for a private S3 object.
 * @param {string} key
 * @param {number} expiresIn — seconds, default 15 min
 */
async function getPresignedUrl(key, expiresIn = 900) {
  if (!USE_S3) throw new Error('S3 not configured');
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * Delete an object from S3.
 */
async function deleteObject(key) {
  if (!USE_S3) return;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Read a local file from disk and upload it to S3, then optionally delete locally.
 */
async function migrateLocalFile(localPath, s3Key, mimetype, deleteLocal = false) {
  const buffer = fs.readFileSync(localPath);
  await uploadBuffer(buffer, s3Key, mimetype);
  if (deleteLocal) fs.unlinkSync(localPath);
  return s3Key;
}

module.exports = { USE_S3, uploadBuffer, getPresignedUrl, deleteObject, migrateLocalFile, BUCKET };
