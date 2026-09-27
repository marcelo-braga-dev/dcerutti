import 'server-only';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Cloudflare R2 (D-06). Opcional: sem as variáveis, o painel aceita só URLs de imagem. */
export const r2Configurado = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.NEXT_PUBLIC_IMAGENS_URL);

let cliente: S3Client | null = null;
const s3 = () =>
  (cliente ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  }));

export async function urlDeEnvio(chave: string, tipo: string) {
  const url = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: chave, ContentType: tipo }), { expiresIn: 300 });
  return { url, publica: `${process.env.NEXT_PUBLIC_IMAGENS_URL!.replace(/\/$/, '')}/${chave}` };
}
