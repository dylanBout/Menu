#!/usr/bin/env python3
"""
Liquidation Hunter - Main Entry Point
CLI interface for the liquidation heatmap trading system
"""

import argparse
import sys
import os
import json
from datetime import datetime, timedelta
import logging

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
from backtesting.backtest_engine import BacktestEngine
from data.price_data import get_price_fetcher
from data.liquidation_data import get_liquidation_fetcher
from strategies.liquidation_heatmap_strategy import get_strategy
from risk_management.risk_calculator import get_risk_calculator

# Setup logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format=config.LOG_FORMAT,
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(config.LOG_FILE)
    ]
)
logger = logging.getLogger(__name__)


def print_banner():
    """Print application banner"""
    banner = """
╔══════════════════════════════════════════════════════════════╗
║          LIQUIDATION HUNTER TRADING SYSTEM                   ║
║          Liquidation Heatmap Strategy for KCEX               ║
║          High-Leverage Perpetuals Trading (50-75x)           ║
╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)


def cmd_backtest(args):
    """Run backtest command"""
    print(f"\n{'='*60}")
    print(f"RUNNING BACKTEST: {args.symbol} @ {args.timeframe}")
    print(f"{'='*60}\n")

    # Create backtest engine
    engine = BacktestEngine(
        initial_balance=args.balance,
        leverage=args.leverage
    )

    # Set date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=args.days)

    # Run backtest
    results = engine.run_backtest(
        args.symbol,
        args.timeframe,
        start_date,
        end_date
    )

    if "error" in results:
        print(f"\n❌ Error: {results['error']}\n")
        return

    # Display results
    print_backtest_results(results)

    # Save results if requested
    if args.save:
        save_backtest_results(results, args.symbol, args.timeframe)


def print_backtest_results(results: dict):
    """Print formatted backtest results"""
    summary = results["summary"]
    trades = results["trades"]
    pnl = results["pnl"]
    risk = results["risk"]

    print("\n" + "="*60)
    print("📊 BACKTEST RESULTS")
    print("="*60)

    # Summary
    print("\n🔍 SUMMARY:")
    print(f"  Symbol:          {summary['symbol']}")
    print(f"  Timeframe:       {summary['timeframe']}")
    print(f"  Period:          {summary['start_date']} to {summary['end_date']}")
    print(f"  Initial Balance: ${summary['initial_balance']:.2f}")
    print(f"  Final Balance:   ${summary['final_balance']:.2f}")
    print(f"  Total P&L:       ${summary['total_pnl']:.2f}")
    print(f"  Return:          {summary['total_return_percent']:.2f}%")

    # Trades
    print("\n📈 TRADES:")
    print(f"  Total Trades:    {trades['total']}")
    print(f"  Winners:         {trades['winners']} ({trades['win_rate_percent']:.1f}%)")
    print(f"  Losers:          {trades['losers']}")
    print(f"  Liquidations:    {trades['liquidations']}")
    print(f"  Stop Losses:     {trades['stop_losses']}")

    # P&L
    print("\n💰 PROFIT & LOSS:")
    print(f"  Total P&L:       ${pnl['total']:.2f}")
    print(f"  Average Win:     ${pnl['average_win']:.2f}")
    print(f"  Average Loss:    ${pnl['average_loss']:.2f}")
    print(f"  Largest Win:     ${pnl['largest_win']:.2f}")
    print(f"  Largest Loss:    ${pnl['largest_loss']:.2f}")
    print(f"  Profit Factor:   {pnl['profit_factor']:.2f}")

    # Risk
    print("\n⚠️  RISK METRICS:")
    print(f"  Max Drawdown:    ${risk['max_drawdown']:.2f} ({risk['max_drawdown_percent']:.2f}%)")
    print(f"  Avg Leverage:    {risk['avg_leverage']:.1f}x")
    print(f"  Avg Position:    ${risk['avg_position_size']:.2f}")

    print("\n" + "="*60 + "\n")


def save_backtest_results(results: dict, symbol: str, timeframe: str):
    """Save backtest results to file"""
    # Create output directory
    os.makedirs(config.BACKTEST_OUTPUT_DIR, exist_ok=True)

    # Generate filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{config.BACKTEST_OUTPUT_DIR}/{symbol}_{timeframe}_{timestamp}.json"

    # Save to file
    with open(filename, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"✅ Results saved to: {filename}\n")


def cmd_scan(args):
    """Scan for current trading opportunities"""
    print(f"\n{'='*60}")
    print(f"SCANNING FOR LIQUIDATION OPPORTUNITIES")
    print(f"{'='*60}\n")

    price_fetcher = get_price_fetcher()
    liq_fetcher = get_liquidation_fetcher()
    strategy = get_strategy()

    for symbol in args.symbols:
        print(f"\n🔎 Analyzing {symbol}...")

        # Get current price
        current_price = price_fetcher.get_current_price(symbol)
        if not current_price:
            print(f"  ❌ Could not fetch price for {symbol}")
            continue

        print(f"  Current Price: ${current_price:,.2f}")

        # Get liquidation clusters
        clusters = liq_fetcher.get_liquidation_clusters(symbol, current_price)
        if not clusters:
            print(f"  ⚠️  No liquidation clusters found")
            continue

        print(f"  📍 Found {len(clusters)} liquidation clusters")

        # Get recent price data
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=6)
        price_data = price_fetcher.get_historical_klines(
            symbol, args.timeframe, start_time, end_time, limit=100
        )

        if price_data is None or price_data.empty:
            print(f"  ❌ Could not fetch price data")
            continue

        # Add indicators
        price_data = price_fetcher.calculate_indicators(price_data)

        # Analyze opportunity
        signal = strategy.analyze_opportunity(
            symbol, current_price, clusters, price_data
        )

        if signal:
            print(f"\n  🎯 TRADE SIGNAL FOUND!")
            print(f"  Side:            {signal['side'].upper()}")
            print(f"  Entry:           ${signal['entry_price']:,.2f}")
            print(f"  Cluster:         ${signal['liquidation_cluster']['price']:,.2f}")
            print(f"  Volume:          ${signal['liquidation_cluster']['volume_usd']:,.0f}")
            print(f"  Signal Strength: {signal['signal_strength']:.0f}/100")
            print(f"  Reason:          {signal['reason']}")

            # Calculate position sizing
            risk_calc = get_risk_calculator()
            exit_levels = strategy.calculate_exit_levels(
                signal['entry_price'],
                signal['side'],
                signal['liquidation_cluster']
            )

            position = risk_calc.calculate_position_size(
                signal['entry_price'],
                exit_levels['stop_loss'],
                risk_percent=1.0,
                leverage=args.leverage
            )

            print(f"\n  💼 POSITION SIZING:")
            print(f"  Position Size:   ${position['position_size_usd']:.2f}")
            print(f"  Margin:          ${position['margin_required']:.2f}")
            print(f"  Leverage:        {position['leverage']}x")
            print(f"  Stop Loss:       ${exit_levels['stop_loss']:.2f}")
            print(f"  Liquidation:     ${position['liquidation_price']:.2f}")
            print(f"  Risk/Reward:     {exit_levels['risk_reward_ratio']:.2f}")

            print(f"\n  🎯 TAKE PROFIT LEVELS:")
            for tp in exit_levels['take_profits']:
                print(f"    TP{tp['level']}: ${tp['price']:.2f} ({tp['percent']}%, {tp['size']*100:.0f}% size)")

        else:
            print(f"  ⚪ No signal at this time")

        # Show nearest liquidation zones
        nearest = liq_fetcher.get_nearest_liquidation_zone(symbol, current_price)
        if nearest:
            print(f"\n  📌 Nearest Liquidation Zone:")
            print(f"    Price:     ${nearest['price']:,.2f}")
            print(f"    Distance:  {nearest['distance_percent']:.2f}%")
            print(f"    Volume:    ${nearest['volume_usd']:,.0f}")

    print(f"\n{'='*60}\n")


def cmd_config(args):
    """Display current configuration"""
    print(f"\n{'='*60}")
    print("⚙️  CURRENT CONFIGURATION")
    print(f"{'='*60}\n")

    print("ACCOUNT:")
    print(f"  Balance:         ${config.ACCOUNT_BALANCE:.2f}")
    print(f"  Max Daily Loss:  ${config.MAX_DAILY_LOSS_USD:.2f} ({config.MAX_DAILY_LOSS_PERCENT}%)")

    print("\nPOSITION SIZING:")
    print(f"  Min Size:        ${config.MIN_POSITION_SIZE:.2f}")
    print(f"  Max Size:        ${config.MAX_POSITION_SIZE:.2f}")
    print(f"  Default Size:    ${config.DEFAULT_POSITION_SIZE:.2f}")

    print("\nLEVERAGE:")
    print(f"  Min:             {config.MIN_LEVERAGE}x")
    print(f"  Max:             {config.MAX_LEVERAGE}x")
    print(f"  Default:         {config.DEFAULT_LEVERAGE}x")

    print("\nTRADING PAIRS:")
    for pair in config.TRADING_PAIRS:
        print(f"  - {pair}")

    print("\nSTRATEGY:")
    print(f"  Stop Loss:       {config.STOP_LOSS_PERCENT}%")
    print(f"  Volume Spike:    {config.REQUIRE_VOLUME_SPIKE} ({config.VOLUME_SPIKE_MULTIPLIER}x)")
    print(f"  RSI Filter:      {config.USE_RSI_FILTER}")
    print(f"  Max Positions:   {config.MAX_CONCURRENT_POSITIONS}")

    print("\nLIQUIDATION HEATMAP:")
    print(f"  Min Volume:      ${config.MIN_LIQUIDATION_VOLUME:,.0f}")
    print(f"  Zone Threshold:  {config.LIQUIDATION_ZONE_THRESHOLD}%")
    print(f"  Refresh Rate:    {config.LIQUIDATION_DATA_REFRESH_RATE}s")

    print(f"\n{'='*60}\n")


def main():
    """Main entry point"""
    print_banner()

    parser = argparse.ArgumentParser(
        description="Liquidation Hunter Trading System",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Backtest command
    backtest_parser = subparsers.add_parser("backtest", help="Run strategy backtest")
    backtest_parser.add_argument("-s", "--symbol", default="BTCUSDT", help="Trading pair")
    backtest_parser.add_argument("-t", "--timeframe", default="5m", help="Timeframe")
    backtest_parser.add_argument("-d", "--days", type=int, default=30, help="Days to backtest")
    backtest_parser.add_argument("-l", "--leverage", type=int, default=config.DEFAULT_LEVERAGE, help="Leverage")
    backtest_parser.add_argument("-b", "--balance", type=float, default=config.ACCOUNT_BALANCE, help="Initial balance")
    backtest_parser.add_argument("--save", action="store_true", help="Save results to file")

    # Scan command
    scan_parser = subparsers.add_parser("scan", help="Scan for trading opportunities")
    scan_parser.add_argument("-s", "--symbols", nargs="+", default=config.TRADING_PAIRS, help="Symbols to scan")
    scan_parser.add_argument("-t", "--timeframe", default="5m", help="Timeframe")
    scan_parser.add_argument("-l", "--leverage", type=int, default=config.DEFAULT_LEVERAGE, help="Leverage")

    # Config command
    config_parser = subparsers.add_parser("config", help="Display configuration")

    # Parse arguments
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Execute command
    try:
        if args.command == "backtest":
            cmd_backtest(args)
        elif args.command == "scan":
            cmd_scan(args)
        elif args.command == "config":
            cmd_config(args)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user\n")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        print(f"\n❌ Error: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
