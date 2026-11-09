/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@bryntum/scheduler-react',
    '@bryntum/scheduler',
    '@bryntum/scheduler-trial',
    'ag-studio-react',
    'ag-grid-react'
  ],
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
    outputFileTracingIncludes: {
      '/api/contracts': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
        './node_modules/pdfjs-dist/build/pdf.worker.mjs',
        './node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'
      ]
    }
  }
};

module.exports = nextConfig;
