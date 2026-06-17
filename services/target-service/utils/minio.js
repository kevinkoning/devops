const Minio = require('minio');
const Opossum = require('opossum');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'photoprestiges-images';

const minioOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 60000,
  volumeThreshold: 10
};

const uploadFileCircuitBreaker = new Opossum(async (options) => {
  const bucketExists = await minioClient.bucketExists(options.bucketName);
  if (!bucketExists) {
    await minioClient.makeBucket(options.bucketName);
    await minioClient.setBucketPolicy(options.bucketName, JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${options.bucketName}/*`]
        }
      ]
    }));
  }

  await minioClient.putObject(options.bucketName, options.fileName, options.fileBuffer, null, options.contentType);
  
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  const port = process.env.MINIO_EXTERNAL_PORT || '9000';
  const publicUrl = `${protocol}://${process.env.MINIO_PUBLIC_HOST || 'localhost'}:${port}/${options.bucketName}/${options.fileName}`;
  
  return publicUrl;
}, minioOptions);

uploadFileCircuitBreaker.on('success', () => console.log('MinIO upload successful'));
uploadFileCircuitBreaker.on('failure', (error) => console.error('MinIO circuit breaker failure:', error.message));
uploadFileCircuitBreaker.on('open', () => console.warn('MinIO circuit breaker OPEN - storage unavailable'));
uploadFileCircuitBreaker.on('halfOpen', () => console.log('MinIO circuit breaker HALF-OPEN - testing storage'));
uploadFileCircuitBreaker.on('close', () => console.log('MinIO circuit breaker CLOSED - storage recovered'));

const uploadFile = async (fileBuffer, fileName, contentType) => {
  try {
    const result = await uploadFileCircuitBreaker.fire({
      bucketName: BUCKET_NAME,
      fileName,
      fileBuffer,
      contentType
    });
    return result;
  } catch (error) {
    console.error('MinIO upload error:', error.message);
    throw error;
  }
};

const deleteFile = async (fileName) => {
  try {
    await minioClient.removeObject(BUCKET_NAME, fileName);
    return true;
  } catch (error) {
    console.error('MinIO delete error:', error);
    throw error;
  }
};

const getFileUrl = (fileName) => {
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  const port = process.env.MINIO_EXTERNAL_PORT || '9000';
  return `${protocol}://${process.env.MINIO_PUBLIC_HOST || 'localhost'}:${port}/${BUCKET_NAME}/${fileName}`;
};

module.exports = { minioClient, uploadFile, deleteFile, getFileUrl, BUCKET_NAME, uploadFileCircuitBreaker };
