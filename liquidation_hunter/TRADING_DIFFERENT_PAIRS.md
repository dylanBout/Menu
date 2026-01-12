# Trading Different Pairs - Complete Guide

## ✅ YES - Strategy Works on ANY Pair

The liquidation heatmap strategy is **pair-agnostic**. It works by:
1. Detecting liquidation clusters
2. Confirming with volume/RSI/patterns
3. Entering when price hits clusters
4. Exiting at TP or SL

This logic works on **ANY perpetual pair** that has liquidation data.

---

## 🎯 PAIRS ALREADY CONFIGURED

I just added SOL and PEPE to your config:

```python
TRADING_PAIRS = [
    "BTCUSDT",   # Bitcoin
    "ETHUSDT",   # Ethereum
    "SOLUSDT",   # Solana
    "PEPEUSDT",  # Pepe memecoin
]
```

**To use them:**
```bash
# Scan all pairs
python main.py scan -s BTCUSDT ETHUSDT SOLUSDT PEPEUSDT

# Or just SOL
python main.py scan -s SOLUSDT

# Backtest PEPE
python main.py backtest -s PEPEUSDT -t 5m -d 30 -l 20 --save
```

---

## 📋 SUPPORTED PAIRS BY EXCHANGE

### **BLOFIN** (Your Exchange)
Check what pairs BLOFIN offers:
- Major: BTC, ETH, BNB, SOL, ADA
- Alts: DOGE, PEPE, SHIB, AVAX, LINK
- Check: https://www.blofin.com/futures

**Any USDT perpetual pair should work!**

### **Binance Futures** (FREE data source)
✅ Supported: 200+ pairs including:
- BTCUSDT, ETHUSDT ← Best liquidity
- SOLUSDT, BNBUSDT ← Good volume
- DOGEUSDT, ADAUSDT ← Medium volume
- PEPEUSDT, SHIBUSDT ← High volatility memecoins
- 1000PEPEUSDT ← Mini PEPE contract

### **Bybit** (FREE data source)
✅ Supported: 300+ pairs
- All major coins
- Many memecoins
- DeFi tokens

---

## ⚠️ CRITICAL WARNINGS FOR ALTCOINS

### **🚨 VOLATILE PAIRS ARE DANGEROUS AT HIGH LEVERAGE**

#### **PEPE Example:**
```
Normal BTC move: ±2% per day
PEPE move: ±20% per day (10x more volatile!)

At 75x leverage:
- BTC: 1.33% move = liquidation
- PEPE: 1.33% move = liquidation (but PEPE moves 20%!)

Result: You'll get liquidated FAST on PEPE at 75x
```

#### **Volatility Comparison:**

| Pair | Daily Volatility | Safe Max Leverage | Recommended |
|------|------------------|-------------------|-------------|
| **BTCUSDT** | ±1-3% | 50-75x | 20-30x |
| **ETHUSDT** | ±2-5% | 30-50x | 15-25x |
| **SOLUSDT** | ±3-8% | 20-30x | 10-15x |
| **DOGEUSDT** | ±5-15% | 10-20x | 5-10x |
| **PEPEUSDT** | ±10-30% | 5-10x | 3-5x |
| **SHIBUSDT** | ±10-40% | 5-10x | 3-5x |

---

## 📊 BEST PAIRS FOR THIS STRATEGY

### **🥇 Tier 1: SAFEST (Recommended Start)**

**BTCUSDT**
- ✅ Highest liquidity
- ✅ Most predictable
- ✅ Best liquidation data
- ✅ Safest for 50-75x leverage
- ✅ Start here!

**ETHUSDT**
- ✅ Second best liquidity
- ✅ Good liquidation clusters
- ⚠️ More volatile than BTC
- ✅ Safe at 30-50x leverage

---

### **🥈 Tier 2: MODERATE RISK**

**SOLUSDT**
- ✅ High volume
- ⚠️ More volatile (3-8% daily)
- ⚠️ Max 20-30x leverage recommended
- ✅ Good for strategy testing

**BNBUSDT**
- ✅ Decent volume
- ⚠️ Moderate volatility
- ✅ Safe at 20-40x leverage

**AVAXUSDT**
- ✅ Good volume
- ⚠️ 5-10% daily moves
- ⚠️ Max 20x leverage

---

### **🥉 Tier 3: HIGH RISK**

**DOGEUSDT**
- ⚠️ Very volatile (5-15% daily)
- ⚠️ Meme-driven price action
- ⚠️ MAX 10x leverage recommended
- ⚠️ Only for experienced traders

**LINKUSDT, ADAUSDT, DOTUSDT**
- ⚠️ Medium alts
- ⚠️ 5-10% daily volatility
- ⚠️ Max 15-20x leverage
- ⚠️ Less liquidation data

---

### **🔴 Tier 4: EXTREMELY DANGEROUS**

**PEPEUSDT, SHIBUSDT, 1000FLOKIUSDT**
- 🚨 EXTREME volatility (10-40% daily!)
- 🚨 Can move 20% in MINUTES
- 🚨 MAX 5x leverage (NOT 75x!)
- 🚨 You WILL get liquidated at high leverage
- 🚨 Only trade if you know what you're doing

**Example:**
```
You short PEPE at $0.00001 with 75x leverage
PEPE pumps 2% (normal for memecoins)
You're LIQUIDATED instantly

Even at 10x leverage:
PEPE pumps 10% → You're down 100% (wiped out)
```

---

## 🎯 RECOMMENDED LEVERAGE BY PAIR

### **Conservative (Recommended):**
```python
BTCUSDT:   20-30x
ETHUSDT:   15-25x
SOLUSDT:   10-15x
DOGEUSDT:  5-10x
PEPEUSDT:  3-5x MAX
```

### **Aggressive (Your current settings):**
```python
BTCUSDT:   50-60x (risky but manageable)
ETHUSDT:   30-40x (risky)
SOLUSDT:   15-20x (very risky)
DOGEUSDT:  DON'T USE 50x! (suicide)
PEPEUSDT:  NEVER USE 50x! (instant liquidation)
```

---

## 🔧 HOW TO ADJUST LEVERAGE PER PAIR

### **Option 1: Manual Override**

When running commands:
```bash
# BTC at 60x (your preference)
python main.py backtest -s BTCUSDT -t 5m -d 30 -l 60

# SOL at lower leverage (safer)
python main.py backtest -s SOLUSDT -t 5m -d 30 -l 15

# PEPE at VERY low leverage (required)
python main.py backtest -s PEPEUSDT -t 5m -d 30 -l 5
```

### **Option 2: Code It In**

I can add automatic leverage adjustment:
```python
# Auto-adjust leverage based on pair volatility
LEVERAGE_BY_PAIR = {
    "BTCUSDT": 60,
    "ETHUSDT": 40,
    "SOLUSDT": 15,
    "PEPEUSDT": 5,
}
```

Want me to implement this?

---

## 📈 DATA AVAILABILITY

### **Which Pairs Have Liquidation Data?**

**Binance (FREE):**
- ✅ All major pairs (BTC, ETH, SOL, etc.)
- ✅ Popular alts (DOGE, ADA, LINK)
- ✅ Top memecoins (PEPE, SHIB)
- ✅ 200+ pairs total

**Bybit (FREE):**
- ✅ Similar to Binance
- ✅ 300+ pairs

**Coinglass ($35/mo):**
- ✅ Aggregated across all exchanges
- ✅ Best for any pair
- ✅ Premium quality

**BLOFIN (when integrated):**
- ✅ Whatever pairs BLOFIN offers
- ✅ Your actual trading exchange

---

## 🚀 HOW TO TEST NEW PAIRS

### **Step 1: Add to Config**
```python
TRADING_PAIRS = [
    "BTCUSDT",
    "SOLUSDT",  # Add your pair here
]
```

### **Step 2: Test Scan**
```bash
python main.py scan -s SOLUSDT
```

Look for:
- ✅ "Found X liquidation clusters" (good)
- ❌ "No liquidation data available" (pair not supported)

### **Step 3: Backtest**
```bash
# Use LOWER leverage for testing
python main.py backtest -s SOLUSDT -t 5m -d 30 -l 15 --save
```

Check:
- Win rate (should be 45-60%)
- Liquidation rate (should be <5%)
- If liquidation rate high → leverage too high

### **Step 4: Adjust Leverage**

If you see many liquidations:
- ⬇️ Reduce leverage by 50%
- Run backtest again
- Repeat until liquidations <5%

---

## ⚠️ COMMON MISTAKES

### **❌ DON'T DO THIS:**

**1. Using 75x on PEPE**
```
Result: Instant liquidation
Fix: Use 5x MAX
```

**2. Same leverage for all pairs**
```
BTC at 60x ✅ OK
PEPE at 60x ❌ DISASTER
Fix: Adjust per pair
```

**3. Trading illiquid pairs**
```
Random low-cap coin with no volume
Result: No liquidation data, wide spreads
Fix: Stick to top 50 coins
```

**4. Ignoring liquidation warnings**
```
Backtest shows 30% liquidations
You: "I'll try it live anyway"
Result: Account blown up
Fix: Listen to the backtest!
```

---

## ✅ RECOMMENDED STARTER PAIRS

### **For Your $100 Account:**

**Week 1-2: Learn the System**
- BTCUSDT only
- 20x leverage (not 75x)
- $1-2 positions
- Master the basics

**Week 3-4: Add Diversity**
- BTCUSDT (60% of trades)
- ETHUSDT (30% of trades)
- SOLUSDT (10% of trades)
- Keep leverage conservative

**Month 2+: Expand Carefully**
- Add alts one at a time
- Lower leverage for each
- Test thoroughly first

---

## 🎯 PAIR-SPECIFIC STRATEGIES

### **BTC Strategy:**
- Higher leverage OK (50-75x)
- Tighter stop loss (1%)
- Focus on major liquidation zones

### **PEPE Strategy:**
- MUCH lower leverage (3-5x)
- Wider stop loss (3-5%)
- Expect wild volatility
- Smaller position sizes

### **SOL Strategy:**
- Medium leverage (10-20x)
- Standard stop loss (1.5%)
- Good middle ground

---

## 📊 QUICK REFERENCE

| Want to Trade | Leverage | Position Size | Risk Level |
|---------------|----------|---------------|------------|
| **BTCUSDT** | 50-75x | $2-4 | Medium |
| **ETHUSDT** | 30-50x | $2-4 | Medium |
| **SOLUSDT** | 10-20x | $1-3 | High |
| **DOGEUSDT** | 5-10x | $1-2 | Very High |
| **PEPEUSDT** | 3-5x | $1 MAX | Extreme |

---

## 🔥 BOTTOM LINE

**YES, you can trade ANY pair, BUT:**

1. **Start with BTC** - Master the strategy first
2. **Lower leverage for alts** - PEPE at 75x = instant death
3. **Test first** - Backtest every new pair before trading
4. **Watch liquidations** - If backtest shows >10% liquidations, leverage too high
5. **Be smart** - Memecoins are EXTREMELY dangerous at high leverage

**The strategy works on all pairs. The question is: Can YOU survive the volatility with your leverage?**

---

## 🚀 READY TO TEST?

**Safe approach:**
```bash
# Test BTC first (safest)
python main.py backtest -s BTCUSDT -t 5m -d 30 -l 20

# Then ETH (moderate)
python main.py backtest -s ETHUSDT -t 5m -d 30 -l 15

# Then SOL (riskier)
python main.py backtest -s SOLUSDT -t 5m -d 30 -l 10

# PEPE only if brave (extreme risk)
python main.py backtest -s PEPEUSDT -t 5m -d 30 -l 5
```

**Check liquidation rates in results:**
- <5% liquidations ✅ Good
- 5-10% liquidations ⚠️ Reduce leverage
- >10% liquidations 🚨 Leverage way too high

Want me to run a comparison backtest on BTC vs SOL vs PEPE to show you the difference?
