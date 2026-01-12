"""
Liquidation Heatmap Strategy
Core strategy logic for hunting liquidation clusters
NOT generic SMC/liquidity sweep - uses actual liquidation data
"""

import pandas as pd
import logging
from typing import Dict, Optional, Tuple
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL))
logger = logging.getLogger(__name__)


class LiquidationHeatmapStrategy:
    """
    Strategy that identifies and trades liquidation clusters

    Core Logic:
    1. Identify significant liquidation clusters from heatmap data
    2. Monitor price movement toward these clusters
    3. Enter when price hits cluster + shows reversal confirmation
    4. Exit at take profit levels or stop loss
    """

    def __init__(self):
        """Initialize the strategy"""
        self.name = "Liquidation Heatmap Hunter"
        logger.info(f"Strategy initialized: {self.name}")

    def analyze_opportunity(
        self,
        symbol: str,
        current_price: float,
        liquidation_clusters: list,
        price_data: pd.DataFrame
    ) -> Optional[Dict]:
        """
        Analyze if there's a trading opportunity

        Args:
            symbol: Trading pair
            current_price: Current market price
            liquidation_clusters: List of liquidation cluster dicts
            price_data: Recent price candles with indicators

        Returns:
            Trade signal dict if opportunity exists, None otherwise
        """
        if not liquidation_clusters or price_data is None or price_data.empty:
            return None

        # Find nearest liquidation cluster
        nearest_cluster = self._find_nearest_cluster(current_price, liquidation_clusters)

        if not nearest_cluster:
            return None

        # Check if price is in the liquidation zone
        in_zone = nearest_cluster["distance_percent"] <= config.LIQUIDATION_ZONE_THRESHOLD

        if not in_zone:
            logger.debug(
                f"{symbol}: Not in zone. Nearest cluster at "
                f"${nearest_cluster['price']:.2f} "
                f"({nearest_cluster['distance_percent']:.2f}% away)"
            )
            return None

        # Check for reversal confirmation
        reversal_confirmed, confirmation_type = self._check_reversal_confirmation(
            price_data, current_price, nearest_cluster
        )

        if not reversal_confirmed:
            logger.debug(f"{symbol}: In zone but no reversal confirmation")
            return None

        # Determine trade direction
        side = self._determine_trade_side(current_price, nearest_cluster)

        # Generate trade signal
        signal = {
            "symbol": symbol,
            "side": side,
            "entry_price": current_price,
            "liquidation_cluster": nearest_cluster,
            "confirmation_type": confirmation_type,
            "signal_strength": self._calculate_signal_strength(
                nearest_cluster, price_data, confirmation_type
            ),
            "reason": (
                f"Liquidation cluster at ${nearest_cluster['price']:.2f} "
                f"(${nearest_cluster['volume_usd']:,.0f} volume) - "
                f"{confirmation_type} confirmed"
            )
        }

        logger.info(f"TRADE SIGNAL: {signal['reason']}")
        return signal

    def _find_nearest_cluster(
        self,
        current_price: float,
        clusters: list
    ) -> Optional[Dict]:
        """Find the nearest significant liquidation cluster"""
        if not clusters:
            return None

        # Sort by distance
        sorted_clusters = sorted(clusters, key=lambda x: x["distance_percent"])

        # Return nearest cluster
        return sorted_clusters[0] if sorted_clusters else None

    def _check_reversal_confirmation(
        self,
        price_data: pd.DataFrame,
        current_price: float,
        cluster: Dict
    ) -> Tuple[bool, str]:
        """
        Check for reversal confirmation signals

        Returns:
            Tuple of (confirmed, confirmation_type)
        """
        confirmations = []

        # Get latest candle
        latest = price_data.iloc[-1]
        prev = price_data.iloc[-2] if len(price_data) > 1 else None

        # 1. Volume spike confirmation
        if config.REQUIRE_VOLUME_SPIKE:
            if "volume_spike" in latest and latest["volume_spike"]:
                confirmations.append("volume_spike")

        # 2. RSI confirmation
        if config.USE_RSI_FILTER and "rsi" in latest:
            rsi = latest["rsi"]
            if pd.notna(rsi):
                # For long entries (price below cluster)
                if current_price < cluster["price"] and rsi < config.RSI_OVERSOLD:
                    confirmations.append("rsi_oversold")
                # For short entries (price above cluster)
                elif current_price > cluster["price"] and rsi > config.RSI_OVERBOUGHT:
                    confirmations.append("rsi_overbought")

        # 3. Candlestick pattern confirmation
        if config.REQUIRE_CANDLESTICK_PATTERN and prev is not None:
            pattern = self._detect_candlestick_pattern(prev, latest)
            if pattern in config.VALID_REVERSAL_PATTERNS:
                confirmations.append(f"pattern_{pattern}")

        # Need at least one confirmation
        if confirmations:
            return True, "+".join(confirmations)

        return False, "none"

    def _detect_candlestick_pattern(
        self,
        prev_candle: pd.Series,
        current_candle: pd.Series
    ) -> str:
        """
        Detect reversal candlestick patterns

        Returns:
            Pattern name or 'none'
        """
        # Calculate candle properties
        curr_body = abs(current_candle["close"] - current_candle["open"])
        curr_range = current_candle["high"] - current_candle["low"]
        curr_upper_wick = current_candle["high"] - max(
            current_candle["open"], current_candle["close"]
        )
        curr_lower_wick = min(
            current_candle["open"], current_candle["close"]
        ) - current_candle["low"]

        prev_body = abs(prev_candle["close"] - prev_candle["open"])

        # Avoid division by zero
        if curr_range == 0 or prev_body == 0:
            return "none"

        # Hammer pattern (bullish reversal)
        # Small body, long lower wick, small upper wick
        if (curr_lower_wick > 2 * curr_body and
            curr_upper_wick < curr_body * 0.3 and
            current_candle["close"] > current_candle["open"]):
            return "hammer"

        # Shooting star (bearish reversal)
        # Small body, long upper wick, small lower wick
        if (curr_upper_wick > 2 * curr_body and
            curr_lower_wick < curr_body * 0.3 and
            current_candle["close"] < current_candle["open"]):
            return "shooting_star"

        # Bullish engulfing
        if (current_candle["close"] > current_candle["open"] and
            prev_candle["close"] < prev_candle["open"] and
            current_candle["close"] > prev_candle["open"] and
            current_candle["open"] < prev_candle["close"] and
            curr_body > prev_body * 1.2):
            return "engulfing"

        # Pin bar (long wick on either side)
        if curr_range > 0:
            if (curr_lower_wick / curr_range > 0.6 and
                curr_body / curr_range < 0.3):
                return "pin_bar"
            if (curr_upper_wick / curr_range > 0.6 and
                curr_body / curr_range < 0.3):
                return "pin_bar"

        return "none"

    def _determine_trade_side(
        self,
        current_price: float,
        cluster: Dict
    ) -> str:
        """
        Determine whether to go long or short

        Logic:
        - If price is below cluster: expect bounce up -> LONG
        - If price is above cluster: expect rejection down -> SHORT
        - Also consider cluster side (long/short liquidations)
        """
        cluster_price = cluster["price"]
        cluster_side = cluster.get("side", "both").lower()

        # Price approaching from below
        if current_price <= cluster_price:
            # Long liquidations mean shorts will be closed -> bullish
            if cluster_side in ["long", "both"]:
                return "long"
            else:
                return "short"

        # Price approaching from above
        else:
            # Short liquidations mean longs will be closed -> bearish
            if cluster_side in ["short", "both"]:
                return "short"
            else:
                return "long"

    def _calculate_signal_strength(
        self,
        cluster: Dict,
        price_data: pd.DataFrame,
        confirmation_type: str
    ) -> float:
        """
        Calculate signal strength (0-100)

        Factors:
        - Liquidation volume (larger = stronger)
        - Number of confirmations
        - Distance to cluster (closer = stronger)
        """
        strength = 50.0  # Base strength

        # Factor 1: Liquidation volume
        volume_usd = cluster["volume_usd"]
        if volume_usd > 1_000_000:
            strength += 20
        elif volume_usd > 500_000:
            strength += 15
        elif volume_usd > 200_000:
            strength += 10

        # Factor 2: Number of confirmations
        num_confirmations = len(confirmation_type.split("+"))
        strength += num_confirmations * 5

        # Factor 3: Distance to cluster (closer = better)
        distance = cluster["distance_percent"]
        if distance < 0.1:
            strength += 15
        elif distance < 0.3:
            strength += 10
        elif distance < 0.5:
            strength += 5

        # Cap at 100
        return min(strength, 100.0)

    def calculate_exit_levels(
        self,
        entry_price: float,
        side: str,
        cluster: Dict
    ) -> Dict:
        """
        Calculate stop loss and take profit levels

        Args:
            entry_price: Entry price
            side: 'long' or 'short'
            cluster: Liquidation cluster dict

        Returns:
            Dict with stop loss and take profit levels
        """
        # Calculate stop loss (tight due to high leverage)
        stop_loss_percent = config.STOP_LOSS_PERCENT

        if side == "long":
            stop_loss = entry_price * (1 - stop_loss_percent / 100)
        else:
            stop_loss = entry_price * (1 + stop_loss_percent / 100)

        # Calculate take profit levels
        take_profits = []
        for i, tp in enumerate(config.TAKE_PROFIT_LEVELS):
            if side == "long":
                tp_price = entry_price * (1 + tp["percent"] / 100)
            else:
                tp_price = entry_price * (1 - tp["percent"] / 100)

            take_profits.append({
                "level": i + 1,
                "price": tp_price,
                "percent": tp["percent"],
                "size": tp["size"]
            })

        return {
            "stop_loss": stop_loss,
            "take_profits": take_profits,
            "risk_reward_ratio": self._calculate_risk_reward(
                entry_price, stop_loss, take_profits[0]["price"]
            )
        }

    def _calculate_risk_reward(
        self,
        entry: float,
        stop_loss: float,
        take_profit: float
    ) -> float:
        """Calculate risk/reward ratio"""
        risk = abs(entry - stop_loss)
        reward = abs(take_profit - entry)

        if risk == 0:
            return 0

        return reward / risk


def get_strategy() -> LiquidationHeatmapStrategy:
    """Get a configured strategy instance"""
    return LiquidationHeatmapStrategy()


if __name__ == "__main__":
    # Test the strategy
    print("Testing Liquidation Heatmap Strategy...\n")

    strategy = get_strategy()

    # Create mock data for testing
    import numpy as np

    # Mock price data
    dates = pd.date_range(start="2024-01-01", periods=50, freq="5min")
    price_data = pd.DataFrame({
        "open": np.random.randn(50).cumsum() + 45000,
        "high": np.random.randn(50).cumsum() + 45100,
        "low": np.random.randn(50).cumsum() + 44900,
        "close": np.random.randn(50).cumsum() + 45000,
        "volume": np.random.randint(100, 1000, 50),
    }, index=dates)

    # Add indicators
    price_data["rsi"] = 35  # Oversold
    price_data["volume_avg"] = price_data["volume"].rolling(20).mean()
    price_data["volume_spike"] = price_data["volume"] > (
        price_data["volume_avg"] * config.VOLUME_SPIKE_MULTIPLIER
    )

    # Mock liquidation cluster
    current_price = 45000.0
    mock_cluster = {
        "price": 45020.0,  # Just above current price
        "volume_usd": 500000,
        "side": "long",
        "distance_percent": 0.04  # Within threshold
    }

    # Test strategy
    signal = strategy.analyze_opportunity(
        "BTCUSDT",
        current_price,
        [mock_cluster],
        price_data
    )

    if signal:
        print("SIGNAL GENERATED:")
        for key, value in signal.items():
            if isinstance(value, dict):
                print(f"  {key}:")
                for k, v in value.items():
                    print(f"    {k}: {v}")
            else:
                print(f"  {key}: {value}")

        # Calculate exit levels
        exits = strategy.calculate_exit_levels(
            signal["entry_price"],
            signal["side"],
            signal["liquidation_cluster"]
        )
        print("\nEXIT LEVELS:")
        print(f"  Stop Loss: ${exits['stop_loss']:.2f}")
        print(f"  Risk/Reward: {exits['risk_reward_ratio']:.2f}")
        print("  Take Profits:")
        for tp in exits["take_profits"]:
            print(f"    TP{tp['level']}: ${tp['price']:.2f} ({tp['percent']}%, {tp['size']*100}% size)")
    else:
        print("No signal generated")
