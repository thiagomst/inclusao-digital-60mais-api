const apiPort = process.env.API_PORT || process.env.PORT || '3000';

module.exports = {
  '/api': {
    target: `http://127.0.0.1:${apiPort}`,
    secure: false,
    changeOrigin: true,
  },
};
