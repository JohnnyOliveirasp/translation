/** @type {import('next').NextConfig} */
const nextConfig = {
  // @livekit/rtc-node é binário nativo — não pode ser empacotado pelo webpack
  serverExternalPackages: ['@livekit/rtc-node', '@google/genai'],
  // permite o celular (rede local) acessar o servidor de dev
  allowedDevOrigins: ['192.168.86.34', '192.168.86.*'],
};

export default nextConfig;
