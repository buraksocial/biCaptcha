# biCaptcha

Biyometrik davranış analizi ile çalışan, gizlilik odaklı ve tamamen self-hosted captcha alternatifi. Botları durdurur, gerçek kullanıcıları yormaz.

## Özellikler

- **Zero-Lag Deneyim** — Gerçek kullanıcılar tek tıkla veya otomatik doğrulanır
- **Gelişmiş Bot Tespiti** — BAS, Puppeteer, Playwright, anti-detect tarayıcı tespiti
- **DOM-Bound VM** — Tarayıcı ortamında çalışmayı zorunlu kılan dinamik bytecode sanal makinesi
- **Telemetri Bütünlüğü** — HMAC-SHA256 ile manipülasyon koruması
- **Self-Hosted** — Verileriniz sizin sunucunuzda kalır
- **SQLite / PostgreSQL** — Geliştirme için SQLite, production için PostgreSQL desteği

## Hızlı Kurulum

### Gereksinimler

- Node.js 20+
- npm, yarn veya pnpm

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Ortam Değişkenlerini Ayarla

```bash
cp .env.example .env.local
```

`.env.local` dosyasını düzenleyin:

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `BICAPTCHA_VERIFY_SECRET` | JWT imzalama anahtarı (min 32 karakter) | *(zorunlu)* |
| `DATABASE_URL` | Veritabanı bağlantı URL'si | `file:./dev.db` (SQLite) |
| `UPSTASH_REDIS_REST_URL` | Rate limiting için Redis URL *(opsiyonel)* | — |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token *(opsiyonel)* | — |

### 3. Veritabanını Oluştur

```bash
npx prisma migrate dev --name init
```

Production için:

```bash
npx prisma migrate deploy
```

### 4. Client Script'i Derle

biCaptcha widget'ı tarayıcıda çalışacak şekilde derlenir ve obfuscate edilir:

```bash
npm run build:client
```

Bu komut `src/lib/bicaptcha-client.ts` kaynağını `public/bicaptcha.js` olarak çıktılar.

### 5. Sunucuyu Başlat

```bash
# Geliştirme
npm run dev

# Production
npm run build
npm start
```

Sunucu [http://localhost:3000](http://localhost:3000) adresinde çalışır.

## Docker ile Kurulum

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build:client
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t bicaptcha .
docker run -p 3000:3000 \
  -e BICAPTCHA_VERIFY_SECRET="your-secret-key-min-32-chars" \
  -e DATABASE_URL="file:./dev.db" \
  -v bicaptcha-data:/app/prisma \
  bicaptcha
```

## Entegrasyon

### Widget Ekleme

Sayfanıza biCaptcha widget'ını eklemek için `examples/basic-integration/` dizinindeki örneğe bakın.

Temel kullanım:

```tsx
import BiCaptcha from '@/components/BiCaptcha';

<BiCaptcha
  siteKey="YOUR_SITE_KEY"
  action="contact_form"
  onVerify={(token) => setCaptchaToken(token)}
/>
```

### Token Doğrulama (Server-Side)

API route'larınızda token'ı doğrulayın:

```ts
import { verifyCaptcha } from '@/lib/verifyCaptcha';

const result = await verifyCaptcha(token);
if (!result.success) {
  return Response.json({ error: result.error }, { status: 400 });
}
// result.riskScore ile risk seviyesini kontrol edebilirsiniz
```

### Site Kaydı

Dashboard'dan (`/dashboard`) yeni site ekleyerek `siteKey` ve `secretKey` alabilirsiniz.

## Proje Yapısı

```
bican-captcha/
├── src/
│   ├── app/
│   │   ├── api/           # API route'ları (challenge, verify, auth, analytics)
│   │   ├── dashboard/     # Yönetim paneli
│   │   └── (auth)/        # Login/Register sayfaları
│   ├── components/        # React bileşenleri
│   └── lib/               # Yardımcı fonksiyonlar & client SDK kaynağı
├── extension/             # Trust Pass tarayıcı eklentisi
├── examples/              # Entegrasyon örnekleri
├── prisma/                # Veritabanı şeması
├── public/                # Statik dosyalar (derlenmiş bicaptcha.js)
├── scripts/               # Build script'leri
└── .env.example           # Ortam değişkenleri şablonu
```

## Lisans

MIT
