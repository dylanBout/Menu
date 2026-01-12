"""
Backtesting Engine
Simulates the liquidation heatmap strategy on historical data
"""

import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import sys
import os
import json

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from data.price_data import get_price_fetcher
from data.liquidation_data import get_liquidation_fetcher
from strategies.liquidation_heatmap_strategy import get_strategy
from risk_management.risk_calculator import get_risk_calculator
from utils.test_data_generator import generate_test_price_data, generate_test_liquidation_clusters

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL))
logger = logging.getLogger(__name__)


class BacktestEngine:
    """
    Backtesting engine for the liquidation heatmap strategy
    Simulates trades with realistic parameters including leverage and fees
    """

    def __init__(
        self,
        initial_balance: float = None,
        leverage: int = None
    ):
        """
        Initialize backtesting engine

        Args:
            initial_balance: Starting account balance
            leverage: Trading leverage
        """
        self.initial_balance = initial_balance or config.ACCOUNT_BALANCE
        self.leverage = leverage or config.DEFAULT_LEVERAGE

        # Initialize components
        self.price_fetcher = get_price_fetcher("Binance")  # Use Binance for backtesting
        self.liq_fetcher = get_liquidation_fetcher()
        self.strategy = get_strategy()
        self.risk_calc = get_risk_calculator(self.initial_balance)

        # Trading state
        self.balance = self.initial_balance
        self.trades = []
        self.open_positions = []
        self.daily_pnl = {}

        logger.info(
            f"BacktestEngine initialized: "
            f"${self.initial_balance:.2f} balance, {self.leverage}x leverage"
        )

    def run_backtest(
        self,
        symbol: str,
        timeframe: str,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> Dict:
        """
        Run backtest for a symbol and timeframe

        Args:
            symbol: Trading pair
            timeframe: Candle timeframe
            start_date: Start date for backtest
            end_date: End date for backtest

        Returns:
            Dict with backtest results
        """
        # Set dates
        end_date = end_date or datetime.now()
        start_date = start_date or (end_date - timedelta(days=config.BACKTEST_DAYS))

        logger.info(
            f"Starting backtest: {symbol} {timeframe} "
            f"from {start_date.date()} to {end_date.date()}"
        )

        # Fetch historical price data
        price_data = self.price_fetcher.get_historical_klines(
            symbol, timeframe, start_date, end_date, limit=1500
        )

        # Fallback to synthetic data if API fails
        if price_data is None or price_data.empty:
            logger.warning("Failed to fetch price data from API - using synthetic test data")
            # Extract base price from symbol name
            base_price = 45000.0 if "BTC" in symbol else 2500.0
            price_data = generate_test_price_data(
                symbol, timeframe, start_date, end_date, initial_price=base_price
            )

        # Add indicators
        price_data = self.price_fetcher.calculate_indicators(price_data)

        logger.info(f"Loaded {len(price_data)} candles")

        # Get liquidation clusters (simulated from current data)
        # In real backtest, this should be historical liquidation data
        current_price = price_data.iloc[-1]["close"]
        liq_clusters = self.liq_fetcher.get_liquidation_clusters(symbol, current_price)

        if not liq_clusters:
            logger.warning("No liquidation data available - using simulated clusters")
            liq_clusters = generate_test_liquidation_clusters(price_data)

        # Simulate trading
        self._simulate_trading(symbol, price_data, liq_clusters, timeframe)

        # Calculate results
        results = self._calculate_results(symbol, timeframe, start_date, end_date)

        logger.info(f"Backtest complete: {len(self.trades)} trades executed")
        return results

    def _simulate_trading(
        self,
        symbol: str,
        price_data: pd.DataFrame,
        liq_clusters: List[Dict],
        timeframe: str
    ):
        """Simulate trading through historical data"""
        for i in range(20, len(price_data)):  # Start after indicator warmup
            current_time = price_data.index[i]
            current_candle = price_data.iloc[i]
            current_price = current_candle["close"]

            # Get recent price history for analysis
            recent_data = price_data.iloc[max(0, i-50):i+1]

            # Update open positions (check for TP/SL/liquidation)
            self._update_open_positions(current_candle)

            # Check if we can open new positions
            if len(self.open_positions) >= config.MAX_CONCURRENT_POSITIONS:
                continue

            # Check for trading signals
            signal = self.strategy.analyze_opportunity(
                symbol, current_price, liq_clusters, recent_data
            )

            if signal:
                # Execute trade
                self._execute_trade(signal, current_time, current_candle)

    def _execute_trade(
        self,
        signal: Dict,
        timestamp: pd.Timestamp,
        candle: pd.Series
    ):
        """Execute a trade based on signal"""
        entry_price = signal["entry_price"]
        side = signal["side"]

        # Calculate stop loss and take profits
        exit_levels = self.strategy.calculate_exit_levels(
            entry_price, side, signal["liquidation_cluster"]
        )

        # Calculate position size
        position = self.risk_calc.calculate_position_size(
            entry_price,
            exit_levels["stop_loss"],
            risk_percent=1.0,
            leverage=self.leverage
        )

        # Check risk limits
        allowed, reason = self.risk_calc.is_within_risk_limits(
            position["max_loss_usd"]
        )

        if not allowed:
            logger.debug(f"Trade rejected: {reason}")
            return

        # Check if we have enough balance
        if position["margin_required"] > self.balance:
            logger.debug(f"Insufficient balance: need ${position['margin_required']:.2f}")
            return

        # Calculate entry fee
        entry_fee = position["position_size_usd"] * config.TAKER_FEE

        # Create position
        position_obj = {
            "id": len(self.trades) + 1,
            "symbol": signal["symbol"],
            "side": side,
            "entry_time": timestamp,
            "entry_price": entry_price,
            "position_size": position["position_size_usd"],
            "leverage": self.leverage,
            "margin": position["margin_required"],
            "stop_loss": exit_levels["stop_loss"],
            "take_profits": exit_levels["take_profits"],
            "liquidation_price": position["liquidation_price"],
            "entry_fee": entry_fee,
            "signal_strength": signal["signal_strength"],
            "status": "open",
            "remaining_size": 1.0  # 100% of position
        }

        # Deduct margin and fee from balance
        self.balance -= (position["margin_required"] + entry_fee)

        # Add to open positions
        self.open_positions.append(position_obj)

        logger.info(
            f"TRADE OPENED: {side.upper()} {signal['symbol']} @ ${entry_price:.2f} "
            f"(${position['position_size_usd']:.2f}, {self.leverage}x)"
        )

    def _update_open_positions(self, candle: pd.Series):
        """Update open positions - check for SL/TP/liquidation"""
        closed_positions = []

        for pos in self.open_positions:
            high = candle["high"]
            low = candle["low"]
            close = candle["close"]

            # Check for liquidation
            if pos["side"] == "long" and low <= pos["liquidation_price"]:
                self._close_position(pos, pos["liquidation_price"], "liquidated", candle.name)
                closed_positions.append(pos)
                continue
            elif pos["side"] == "short" and high >= pos["liquidation_price"]:
                self._close_position(pos, pos["liquidation_price"], "liquidated", candle.name)
                closed_positions.append(pos)
                continue

            # Check for stop loss
            if pos["side"] == "long" and low <= pos["stop_loss"]:
                self._close_position(pos, pos["stop_loss"], "stop_loss", candle.name)
                closed_positions.append(pos)
                continue
            elif pos["side"] == "short" and high >= pos["stop_loss"]:
                self._close_position(pos, pos["stop_loss"], "stop_loss", candle.name)
                closed_positions.append(pos)
                continue

            # Check for take profit levels
            for tp in pos["take_profits"]:
                if tp.get("hit", False):
                    continue

                if pos["side"] == "long" and high >= tp["price"]:
                    # Partial close at TP
                    self._partial_close_position(pos, tp, candle.name)
                elif pos["side"] == "short" and low <= tp["price"]:
                    # Partial close at TP
                    self._partial_close_position(pos, tp, candle.name)

            # If all TPs hit, close the position
            if pos["remaining_size"] <= 0:
                closed_positions.append(pos)

        # Remove closed positions
        for pos in closed_positions:
            if pos in self.open_positions:
                self.open_positions.remove(pos)

    def _partial_close_position(
        self,
        position: Dict,
        tp_level: Dict,
        timestamp: pd.Timestamp
    ):
        """Partially close position at take profit"""
        tp_level["hit"] = True
        exit_price = tp_level["price"]
        close_size = tp_level["size"]

        # Calculate P&L for this portion
        pnl = self._calculate_pnl(
            position["entry_price"],
            exit_price,
            position["position_size"] * close_size,
            position["side"]
        )

        # Calculate exit fee
        exit_fee = position["position_size"] * close_size * config.TAKER_FEE

        # Net P&L
        net_pnl = pnl - exit_fee

        # Return margin portion to balance
        margin_returned = position["margin"] * close_size
        self.balance += margin_returned + net_pnl

        # Update position
        position["remaining_size"] -= close_size

        logger.info(
            f"TP{tp_level['level']} HIT: {position['symbol']} @ ${exit_price:.2f} "
            f"({close_size*100}% closed, P&L: ${net_pnl:.2f})"
        )

    def _close_position(
        self,
        position: Dict,
        exit_price: float,
        reason: str,
        timestamp: pd.Timestamp
    ):
        """Fully close a position"""
        close_size = position["remaining_size"]

        if close_size <= 0:
            return

        # Calculate P&L
        pnl = self._calculate_pnl(
            position["entry_price"],
            exit_price,
            position["position_size"] * close_size,
            position["side"]
        )

        # Calculate exit fee (no fee for liquidation)
        exit_fee = 0 if reason == "liquidated" else (
            position["position_size"] * close_size * config.TAKER_FEE
        )

        # Net P&L
        net_pnl = pnl - exit_fee

        # Return margin (if not liquidated)
        if reason != "liquidated":
            margin_returned = position["margin"] * close_size
            self.balance += margin_returned + net_pnl
        else:
            # Margin lost in liquidation
            self.balance += net_pnl  # Usually negative or zero

        # Record trade
        trade_record = {
            **position,
            "exit_time": timestamp,
            "exit_price": exit_price,
            "exit_reason": reason,
            "pnl": pnl,
            "exit_fee": exit_fee,
            "net_pnl": net_pnl,
            "return_percent": (net_pnl / position["margin"]) * 100,
            "status": "closed"
        }

        self.trades.append(trade_record)

        # Update daily P&L
        date = timestamp.date() if hasattr(timestamp, 'date') else timestamp
        self.daily_pnl[date] = self.daily_pnl.get(date, 0) + net_pnl

        logger.info(
            f"TRADE CLOSED: {position['symbol']} @ ${exit_price:.2f} "
            f"({reason}, P&L: ${net_pnl:.2f})"
        )

    def _calculate_pnl(
        self,
        entry_price: float,
        exit_price: float,
        position_size: float,
        side: str
    ) -> float:
        """Calculate P&L for a position"""
        if side == "long":
            pnl_percent = (exit_price - entry_price) / entry_price
        else:
            pnl_percent = (entry_price - exit_price) / entry_price

        pnl = position_size * pnl_percent
        return pnl

    def _generate_simulated_clusters(
        self,
        price_data: pd.DataFrame
    ) -> List[Dict]:
        """Generate simulated liquidation clusters from price data"""
        clusters = []
        current_price = price_data.iloc[-1]["close"]

        # Create clusters at key levels (support/resistance)
        high_20 = price_data["high"].rolling(20).max().iloc[-1]
        low_20 = price_data["low"].rolling(20).min().iloc[-1]

        clusters.append({
            "price": high_20,
            "volume_usd": 250000,
            "side": "short",
            "distance_percent": abs(high_20 - current_price) / current_price * 100
        })

        clusters.append({
            "price": low_20,
            "volume_usd": 250000,
            "side": "long",
            "distance_percent": abs(low_20 - current_price) / current_price * 100
        })

        return clusters

    def _calculate_results(
        self,
        symbol: str,
        timeframe: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict:
        """Calculate backtest results and metrics"""
        if not self.trades:
            return {
                "error": "No trades executed",
                "total_trades": 0
            }

        df_trades = pd.DataFrame(self.trades)

        # Basic metrics
        total_trades = len(df_trades)
        winning_trades = len(df_trades[df_trades["net_pnl"] > 0])
        losing_trades = len(df_trades[df_trades["net_pnl"] < 0])
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0

        # P&L metrics
        total_pnl = df_trades["net_pnl"].sum()
        avg_win = df_trades[df_trades["net_pnl"] > 0]["net_pnl"].mean() if winning_trades > 0 else 0
        avg_loss = df_trades[df_trades["net_pnl"] < 0]["net_pnl"].mean() if losing_trades > 0 else 0
        largest_win = df_trades["net_pnl"].max()
        largest_loss = df_trades["net_pnl"].min()

        # Return metrics
        total_return_percent = (total_pnl / self.initial_balance) * 100
        final_balance = self.balance + sum(pos["margin"] for pos in self.open_positions)

        # Drawdown
        cumulative_pnl = df_trades["net_pnl"].cumsum()
        running_max = cumulative_pnl.cummax()
        drawdown = (cumulative_pnl - running_max)
        max_drawdown = drawdown.min()
        max_drawdown_percent = (max_drawdown / self.initial_balance) * 100

        # Risk metrics
        liquidations = len(df_trades[df_trades["exit_reason"] == "liquidated"])
        stop_losses = len(df_trades[df_trades["exit_reason"] == "stop_loss"])

        # Average metrics
        avg_leverage = df_trades["leverage"].mean()
        avg_position_size = df_trades["position_size"].mean()

        results = {
            "summary": {
                "symbol": symbol,
                "timeframe": timeframe,
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "initial_balance": self.initial_balance,
                "final_balance": final_balance,
                "total_pnl": total_pnl,
                "total_return_percent": total_return_percent
            },
            "trades": {
                "total": total_trades,
                "winners": winning_trades,
                "losers": losing_trades,
                "win_rate_percent": win_rate,
                "liquidations": liquidations,
                "stop_losses": stop_losses
            },
            "pnl": {
                "total": total_pnl,
                "average_win": avg_win,
                "average_loss": avg_loss,
                "largest_win": largest_win,
                "largest_loss": largest_loss,
                "profit_factor": abs(avg_win / avg_loss) if avg_loss != 0 else 0
            },
            "risk": {
                "max_drawdown": max_drawdown,
                "max_drawdown_percent": max_drawdown_percent,
                "avg_leverage": avg_leverage,
                "avg_position_size": avg_position_size
            },
            "trades_data": df_trades.to_dict("records")
        }

        return results


def run_backtest(
    symbol: str,
    timeframe: str,
    days: int = None
) -> Dict:
    """Convenience function to run a backtest"""
    days = days or config.BACKTEST_DAYS
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    engine = BacktestEngine()
    results = engine.run_backtest(symbol, timeframe, start_date, end_date)

    return results


if __name__ == "__main__":
    # Run a test backtest
    print("Running Backtest...\n")

    results = run_backtest("BTCUSDT", "5m", days=7)

    if "error" in results:
        print(f"Error: {results['error']}")
    else:
        print("=== BACKTEST RESULTS ===\n")
        print("SUMMARY:")
        for key, value in results["summary"].items():
            print(f"  {key}: {value}")

        print("\nTRADES:")
        for key, value in results["trades"].items():
            print(f"  {key}: {value}")

        print("\nP&L:")
        for key, value in results["pnl"].items():
            if isinstance(value, float):
                print(f"  {key}: ${value:.2f}")
            else:
                print(f"  {key}: {value}")

        print("\nRISK:")
        for key, value in results["risk"].items():
            if isinstance(value, float):
                print(f"  {key}: {value:.2f}")
            else:
                print(f"  {key}: {value}")
