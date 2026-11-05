/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@bryntum/scheduler-react',
    '@bryntum/scheduler',
    '@bryntum/scheduler-trial',
    'ag-studio-react',
    'ag-grid-react'
  ]
};

module.exports = nextConfig;
