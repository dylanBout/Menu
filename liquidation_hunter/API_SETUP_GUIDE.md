# API Setup Guide - Liquidation Hunter

## Quick Start (3 Methods)

### Method 1: Interactive Setup Script (Easiest)

```bash
cd /home/user/Menu/liquidation_hunter
./setup_api_keys.sh
```

This will guide you through adding all API keys interactively.

---

### Method 2: Manual Edit (Direct)

```bash
# Open config file
nano config.py

# Scroll to line 97 and add your keys:
COINGLASS_API_KEY = "paste_your_key_here"
KCEX_API_KEY = "paste_your_key_here"
KCEX_SECRET_KEY = "paste_your_secret_here"

# Save and exit: Ctrl+O, Enter, Ctrl+X
```

---

### Method 3: Use sed Command (Advanced)

```bash
# Add Coinglass API key
sed -i 's/COINGLASS_API_KEY = ""/COINGLASS_API_KEY = "your_key_here"/' config.py

# Add KCEX API keys
sed -i 's/KCEX_API_KEY = ""/KCEX_API_KEY = "your_key_here"/' config.py
sed -i 's/KCEX_SECRET_KEY = ""/KCEX_SECRET_KEY = "your_secret_here"/' config.py
```

---

## Where to Get API Keys

### 🔥 COINGLASS (HIGHEST PRIORITY)

**Why:** Provides real liquidation heatmap data (core of the strategy)

**Where to get:**
1. Go to: https://www.coinglass.com/
2. Sign up for free account
3. Navigate: Profile → API Management
4. Click "Create API Key"
5. Copy the key

**Free tier:** Yes, sufficient for this system

**What it unlocks:**
- Real liquidation cluster data
- Actual liquidation volumes
- Historical liquidation events

---

### 💱 KCEX (YOUR EXCHANGE)

**Why:** Your actual trading exchange, provides accurate price data

**Where to get:**
1. Log into KCEX account
2. Go to: Account → API Management (or Security settings)
3. Create new API key with these settings:
   - ✅ **Enable:** Read permissions
   - ❌ **Disable:** Trading permissions (for safety)
   - ❌ **Disable:** Withdrawal permissions
4. Optional: Add IP whitelist for security
5. Save both API Key and Secret Key

**Important:** Check KCEX documentation for exact API endpoint URL

**What it unlocks:**
- Real-time price data from your exchange
- Accurate spreads and liquidity
- Your actual trading pairs

---

### 📊 BINANCE (OPTIONAL BACKUP)

**Why:** Backup price data source, very reliable

**Where to get:**
1. Go to: https://www.binance.com/ (or Binance.US)
2. Log in → Profile → API Management
3. Create API key
4. **Set READ-ONLY permissions**
5. No trading/withdrawal permissions needed

**Free tier:** Yes, public endpoints are free

**What it unlocks:**
- Backup price data if KCEX fails
- Higher liquidity reference prices
- More historical data

---

## 🔒 Security Best Practices

### DO ✅
- Use **READ-ONLY** API keys for backtesting/scanning
- Enable **IP whitelisting** if exchange supports it
- Store keys in `config.py` (it's in `.gitignore`)
- Keep `config.py.backup` as backup
- Test with small amounts first

### DON'T ❌
- Never share `config.py` file
- Never commit API keys to GitHub
- Don't enable trading permissions unless you want auto-trading
- Don't enable withdrawal permissions
- Don't use main API keys - create dedicated ones

---

## Testing API Keys

After adding keys, test them:

### Test Coinglass:
```bash
python -c "
import sys
sys.path.append('.')
from data.liquidation_data import get_liquidation_fetcher
fetcher = get_liquidation_fetcher()
data = fetcher.get_liquidation_heatmap('BTC')
print('✅ Coinglass working!' if data is not None else '❌ Coinglass failed')
"
```

### Test Price Data:
```bash
python -c "
import sys
sys.path.append('.')
from data.price_data import get_price_fetcher
fetcher = get_price_fetcher()
price = fetcher.get_current_price('BTCUSDT')
print(f'✅ Price data working! BTC = \${price:,.2f}' if price else '❌ Price data failed')
"
```

### Or just run a scan:
```bash
python main.py scan -s BTCUSDT
```

If you see "Failed to fetch price data from API - using synthetic test data", your API keys aren't working yet.

---

## Troubleshooting

### "Access denied" or "Invalid API key"
- Double-check you copied the full key (no extra spaces)
- Check if key has correct permissions
- Some exchanges require email/2FA verification

### "API rate limit exceeded"
- Free tiers have limits (usually 100-1000 requests/minute)
- Add delays between requests
- Upgrade to paid tier if needed

### "No liquidation data available"
- Coinglass API may be down
- System will fall back to simulated clusters
- Check Coinglass status: https://status.coinglass.com/

### Binance "Access denied"
- Binance blocks some regions/IPs
- Use VPN or stick with KCEX for price data
- Public endpoints should work without API key

---

## What Happens Without API Keys?

The system will still work, but with limitations:

**Without Coinglass:**
- ✅ Backtesting works (uses simulated liquidation zones)
- ⚠️ Less accurate - generates clusters from price action
- ⚠️ Not using real liquidation data

**Without KCEX/Binance:**
- ✅ Backtesting works (uses synthetic price data)
- ❌ Very inaccurate - random price movements
- ❌ Not suitable for real strategy validation

**Recommended minimum:**
- Get **Coinglass API** for real liquidation data
- Use **KCEX or Binance** for price data

---

## Cost Summary

| Service | Free Tier | Paid Plans | Recommended |
|---------|-----------|------------|-------------|
| **Coinglass** | ✅ Yes | From $29/mo | Free tier OK |
| **KCEX** | ✅ Yes (if you have account) | N/A | Free |
| **Binance** | ✅ Yes | N/A | Free |

**Total cost to run this system: $0** (with free tiers)

---

## Quick Commands Reference

```bash
# Setup APIs (interactive)
./setup_api_keys.sh

# Edit config manually
nano config.py

# Test setup
python main.py scan -s BTCUSDT

# Run backtest with real data
python main.py backtest -s BTCUSDT -t 5m -d 30 --save

# Check config
python main.py config
```

---

## Need Help?

1. Check KCEX API documentation
2. Check Coinglass API docs: https://coinglass.com/api
3. Review `config.py` lines 95-108
4. Test individual components as shown above

**Remember:** Start with Coinglass API for liquidation data - that's the core of this strategy!
