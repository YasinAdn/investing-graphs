'use strict';

const { getLiveSnapshot } = require('../../live-market-service.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const force = req.query && req.query.force === '1';
    const snapshot = await getLiveSnapshot(force);
    res.setHeader('Cache-Control', 'public, s-maxage=4, stale-while-revalidate=8');
    return res.status(200).json({ ...snapshot, sseSupported: false });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Live market fetch error' });
  }
};
