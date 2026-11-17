'use strict';

const { fetchLiveHistory } = require('../../live-market-service.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const kind = (req.query && req.query.kind) || 'nasdaq';
    const symbol = (req.query && req.query.symbol) || '^NDX';
    const range = (req.query && req.query.range) || '1y';
    const hist = await fetchLiveHistory(kind, symbol, range);
    res.setHeader('Cache-Control', range === '1d' ? 'public, s-maxage=20, stale-while-revalidate=40' : 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(hist);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Live history fetch error' });
  }
};
