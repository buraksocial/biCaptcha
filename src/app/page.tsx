'use client';

import { ShieldCheck, Lock, Zap, Server } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-orange-500/30">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-24 flex flex-col items-center text-center">
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <ShieldCheck className="w-12 h-12 text-orange-500" />
          <h1 className="text-5xl font-bold tracking-tight">biCaptcha</h1>
        </div>
        
        <p className="text-xl text-zinc-400 max-w-2xl mb-12 leading-relaxed">
          Biyometrik davranış analizi ile çalışan, gizlilik odaklı ve self-hosted captcha alternatifi.
          Botları durdurur, gerçek kullanıcıları yormaz.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-12">
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-yellow-500" />}
            title="Zero-Lag Deneyim"
            description="Gerçek kullanıcılar tek tıkla veya otomatik doğrulanır. Yapay zeka tabanlı risk analizi arka planda çalışır."
          />
          <FeatureCard 
            icon={<Lock className="w-6 h-6 text-blue-500" />}
            title="Gelişmiş Bot Tespiti"
            description="BAS, Puppeteer, Playwright ve anti-detect tarayıcıları tespit eden çok katmanlı telemetri analizi."
          />
          <FeatureCard 
            icon={<Server className="w-6 h-6 text-green-500" />}
            title="Tam Self-Hosted"
            description="Verileriniz sizin sunucunuzda kalır. SQLite/PostgreSQL desteği ile kolay kurulum ve ölçeklendirme."
          />
        </div>

        <div className="mt-16 p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl max-w-3xl w-full">
          <h3 className="text-lg font-semibold mb-4 text-zinc-200">Hızlı Başlangıç</h3>
          <pre className="text-left bg-zinc-950 p-4 rounded-lg overflow-x-auto text-sm text-zinc-300 border border-zinc-800">
{`# 1. Bağımlılıkları yükle
npm install

# 2. Ortam değişkenlerini ayarla
cp .env.example .env.local

# 3. Veritabanını oluştur
npx prisma migrate dev --name init

# 4. Client script'i derle
npm run build:client

# 5. Geliştirme sunucusunu başlat
npm run dev`}
          </pre>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl hover:border-orange-500/50 transition-colors text-left group">
      <div className="mb-4 p-3 bg-zinc-950 rounded-lg w-fit group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
