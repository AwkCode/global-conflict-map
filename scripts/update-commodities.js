#!/usr/bin/env node
// Fetches commodity prices from Yahoo Finance and writes public/commodities.json
// Run via GitHub Actions alongside the hourly strike update.

const fs = require('fs');
const path = require('path');

const COMMODITIES = [
    { symbol: 'CL=F',  name: 'WTI Crude',   unit: '$/bbl' },
    { symbol: 'BZ=F',  name: 'Brent Crude',  unit: '$/bbl' },
    { symbol: 'NG=F',  name: 'Natural Gas',  unit: '$/MMBtu' },
    { symbol: 'GC=F',  name: 'Gold',         unit: '$/oz' },
    { symbol: 'SI=F',  name: 'Silver',       unit: '$/oz' },
    { symbol: 'HO=F',  name: 'Heating Oil',  unit: '$/gal' },
    { symbol: 'RB=F',  name: 'Gasoline',     unit: '$/gal' },
];

async function fetchYahoo(symbol) {
    // Yahoo Finance v8 chart endpoint — no API key needed
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=7d&interval=1d`;
    const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ww3-bot/1.0)' }
    });
    if (!resp.ok) throw new Error(`Yahoo ${symbol}: ${resp.status}`);
    const json = await resp.json();
    const result = json.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo ${symbol}: no result`);

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter(c => c != null);

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || validCloses[validCloses.length - 2] || price;
    const weekAgoClose = validCloses[0] || prevClose;

    const dayChange = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
    const weekChange = weekAgoClose ? ((price - weekAgoClose) / weekAgoClose * 100) : 0;

    return {
        price,
        dayChange: Math.round(dayChange * 100) / 100,
        weekChange: Math.round(weekChange * 100) / 100,
        history: validCloses.length >= 2 ? validCloses : [prevClose, price],
    };
}

async function main() {
    console.log('[commodities] Fetching prices...');
    const results = [];

    for (const c of COMMODITIES) {
        try {
            const data = await fetchYahoo(c.symbol);
            results.push({ ...c, ...data });
            console.log(`  ${c.name}: $${data.price} (day: ${data.dayChange > 0 ? '+' : ''}${data.dayChange}%)`);
        } catch (e) {
            console.warn(`  ${c.name}: FAILED — ${e.message}`);
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
    }

    if (results.length === 0) {
        console.warn('[commodities] All fetches failed, keeping existing file');
        return;
    }

    const outPath = path.join(__dirname, '..', 'public', 'commodities.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`[commodities] Wrote ${results.length} commodities to ${outPath}`);
}

main().catch(e => {
    console.error('[commodities] Fatal:', e.message);
    process.exit(1);
});
