"""
Risk Management Module
Handles position sizing, liquidation calculations, and risk limits
Critical for high-leverage trading (50-75x)
"""

import logging
from typing import Dict, Optional, Tuple
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL))
logger = logging.getLogger(__name__)


class RiskCalculator:
    """Calculate position sizes, liquidation prices, and manage risk"""

    def __init__(self, account_balance: float = None):
        """
        Initialize risk calculator

        Args:
            account_balance: Total account balance in USD
        """
        self.account_balance = account_balance or config.ACCOUNT_BALANCE
        self.daily_loss = 0.0
        self.max_daily_loss = config.MAX_DAILY_LOSS_USD

        logger.info(f"RiskCalculator initialized with ${self.account_balance:.2f} balance")

    def calculate_position_size(
        self,
        entry_price: float,
        stop_loss_price: float,
        risk_percent: float = 1.0,
        leverage: int = None
    ) -> Dict:
        """
        Calculate optimal position size based on risk parameters

        Args:
            entry_price: Entry price for the trade
            stop_loss_price: Stop loss price
            risk_percent: Percentage of account to risk (default 1%)
            leverage: Leverage multiplier

        Returns:
            Dict with position sizing details
        """
        leverage = leverage or config.DEFAULT_LEVERAGE

        # Calculate risk amount in USD
        risk_amount = self.account_balance * (risk_percent / 100)

        # Calculate stop loss distance as percentage
        stop_loss_distance = abs(entry_price - stop_loss_price) / entry_price

        # Position size without leverage
        base_position_size = risk_amount / stop_loss_distance

        # Adjust for leverage (we can use smaller margin)
        margin_required = base_position_size / leverage

        # Ensure position size is within configured limits
        position_size = max(
            config.MIN_POSITION_SIZE,
            min(base_position_size, config.MAX_POSITION_SIZE)
        )

        # Actual margin required
        actual_margin = position_size / leverage

        # Calculate liquidation price
        liquidation_price = self.calculate_liquidation_price(
            entry_price, leverage, "long" if entry_price < stop_loss_price else "short"
        )

        result = {
            "position_size_usd": position_size,
            "margin_required": actual_margin,
            "leverage": leverage,
            "entry_price": entry_price,
            "stop_loss_price": stop_loss_price,
            "liquidation_price": liquidation_price,
            "risk_amount": risk_amount,
            "risk_percent": risk_percent,
            "stop_loss_percent": stop_loss_distance * 100,
            "max_loss_usd": position_size * stop_loss_distance
        }

        logger.debug(
            f"Position size: ${position_size:.2f}, "
            f"Margin: ${actual_margin:.2f}, "
            f"Leverage: {leverage}x"
        )

        return result

    def calculate_liquidation_price(
        self,
        entry_price: float,
        leverage: int,
        side: str,
        maintenance_margin_rate: float = 0.004
    ) -> float:
        """
        Calculate liquidation price for a leveraged position

        Args:
            entry_price: Entry price
            leverage: Leverage multiplier
            side: 'long' or 'short'
            maintenance_margin_rate: Exchange maintenance margin (0.4% default)

        Returns:
            Liquidation price
        """
        # Initial margin
        initial_margin_rate = 1 / leverage

        # Liquidation price formulas
        if side.lower() == "long":
            # Long liquidation = Entry * (1 - Initial Margin + Maintenance Margin)
            liq_price = entry_price * (1 - initial_margin_rate + maintenance_margin_rate)
        else:
            # Short liquidation = Entry * (1 + Initial Margin - Maintenance Margin)
            liq_price = entry_price * (1 + initial_margin_rate - maintenance_margin_rate)

        logger.debug(
            f"{side.upper()} liquidation price at {leverage}x: "
            f"${liq_price:.2f} (entry: ${entry_price:.2f})"
        )

        return liq_price

    def calculate_stop_loss_price(
        self,
        entry_price: float,
        side: str,
        stop_loss_percent: float = None
    ) -> float:
        """
        Calculate stop loss price

        Args:
            entry_price: Entry price
            side: 'long' or 'short'
            stop_loss_percent: Stop loss percentage (default from config)

        Returns:
            Stop loss price
        """
        stop_loss_percent = stop_loss_percent or config.STOP_LOSS_PERCENT

        if side.lower() == "long":
            stop_price = entry_price * (1 - stop_loss_percent / 100)
        else:
            stop_price = entry_price * (1 + stop_loss_percent / 100)

        return stop_price

    def calculate_take_profit_levels(
        self,
        entry_price: float,
        side: str
    ) -> list:
        """
        Calculate multiple take profit levels

        Args:
            entry_price: Entry price
            side: 'long' or 'short'

        Returns:
            List of take profit levels with prices and position sizes
        """
        tp_levels = []

        for tp in config.TAKE_PROFIT_LEVELS:
            percent = tp["percent"]
            size = tp["size"]

            if side.lower() == "long":
                price = entry_price * (1 + percent / 100)
            else:
                price = entry_price * (1 - percent / 100)

            tp_levels.append({
                "price": price,
                "percent": percent,
                "size": size,
                "description": f"TP{len(tp_levels) + 1}: {percent}% ({size * 100}% position)"
            })

        return tp_levels

    def is_within_risk_limits(self, potential_loss: float) -> Tuple[bool, str]:
        """
        Check if a trade is within risk limits

        Args:
            potential_loss: Potential loss amount in USD

        Returns:
            Tuple of (is_allowed, reason)
        """
        # Check daily loss limit
        if self.daily_loss + potential_loss > self.max_daily_loss:
            remaining = self.max_daily_loss - self.daily_loss
            return False, f"Exceeds daily loss limit (${remaining:.2f} remaining)"

        # Check if potential loss exceeds single trade limit (5% of account)
        max_single_loss = self.account_balance * 0.05
        if potential_loss > max_single_loss:
            return False, f"Single trade risk too high (max ${max_single_loss:.2f})"

        return True, "Within risk limits"

    def update_daily_loss(self, loss_amount: float):
        """
        Update daily loss tracker

        Args:
            loss_amount: Loss from closed trade (negative for profit)
        """
        self.daily_loss += loss_amount
        logger.info(f"Daily loss updated: ${self.daily_loss:.2f} / ${self.max_daily_loss:.2f}")

        if self.daily_loss >= self.max_daily_loss:
            logger.warning("DAILY LOSS LIMIT REACHED - STOP TRADING!")

    def reset_daily_loss(self):
        """Reset daily loss counter (call at start of new trading day)"""
        logger.info(f"Resetting daily loss (was ${self.daily_loss:.2f})")
        self.daily_loss = 0.0

    def check_liquidation_risk(
        self,
        entry_price: float,
        current_price: float,
        liquidation_price: float,
        side: str
    ) -> Dict:
        """
        Check how close current price is to liquidation

        Args:
            entry_price: Entry price
            current_price: Current market price
            liquidation_price: Calculated liquidation price
            side: 'long' or 'short'

        Returns:
            Dict with liquidation risk assessment
        """
        # Calculate distance to liquidation
        if side.lower() == "long":
            distance_to_liq = ((current_price - liquidation_price) / current_price) * 100
            pnl_percent = ((current_price - entry_price) / entry_price) * 100
        else:
            distance_to_liq = ((liquidation_price - current_price) / current_price) * 100
            pnl_percent = ((entry_price - current_price) / entry_price) * 100

        # Determine risk level
        if distance_to_liq <= 0:
            risk_level = "LIQUIDATED"
        elif distance_to_liq < 0.5:
            risk_level = "CRITICAL"
        elif distance_to_liq < 1.0:
            risk_level = "HIGH"
        elif distance_to_liq < 2.0:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        return {
            "risk_level": risk_level,
            "distance_to_liquidation_percent": distance_to_liq,
            "pnl_percent": pnl_percent,
            "should_close": risk_level in ["CRITICAL", "LIQUIDATED"],
            "warning": f"{risk_level} RISK - {distance_to_liq:.2f}% to liquidation"
        }

    def calculate_portfolio_risk(self, open_positions: list) -> Dict:
        """
        Calculate total portfolio risk from all open positions

        Args:
            open_positions: List of open position dicts

        Returns:
            Dict with portfolio risk metrics
        """
        total_margin = sum(pos.get("margin_required", 0) for pos in open_positions)
        total_risk = sum(pos.get("risk_amount", 0) for pos in open_positions)

        margin_usage_percent = (total_margin / self.account_balance) * 100
        risk_percent = (total_risk / self.account_balance) * 100

        return {
            "num_positions": len(open_positions),
            "total_margin_used": total_margin,
            "margin_usage_percent": margin_usage_percent,
            "total_risk_amount": total_risk,
            "risk_percent": risk_percent,
            "available_margin": self.account_balance - total_margin,
            "can_open_more": len(open_positions) < config.MAX_CONCURRENT_POSITIONS
        }


def get_risk_calculator(account_balance: float = None) -> RiskCalculator:
    """Get a configured risk calculator instance"""
    return RiskCalculator(account_balance)


if __name__ == "__main__":
    # Test the risk calculator
    print("Testing Risk Calculator...\n")

    calc = get_risk_calculator()

    # Test position sizing
    entry_price = 45000.0
    leverage = 60

    # Calculate stop loss
    stop_loss = calc.calculate_stop_loss_price(entry_price, "long")
    print(f"Entry: ${entry_price:,.2f}")
    print(f"Stop Loss: ${stop_loss:,.2f} ({config.STOP_LOSS_PERCENT}%)\n")

    # Calculate liquidation price
    liq_price = calc.calculate_liquidation_price(entry_price, leverage, "long")
    print(f"Liquidation Price at {leverage}x: ${liq_price:,.2f}")
    print(f"Distance to liquidation: {((entry_price - liq_price) / entry_price * 100):.2f}%\n")

    # Calculate position size
    position = calc.calculate_position_size(entry_price, stop_loss, risk_percent=1.0, leverage=leverage)
    print("Position Sizing:")
    for key, value in position.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4f}")
        else:
            print(f"  {key}: {value}")

    # Calculate take profit levels
    print("\nTake Profit Levels:")
    tp_levels = calc.calculate_take_profit_levels(entry_price, "long")
    for tp in tp_levels:
        print(f"  {tp['description']}: ${tp['price']:,.2f}")

    # Test liquidation risk
    print("\nLiquidation Risk Assessment:")
    current_price = 44500.0  # Simulating a small loss
    risk_assessment = calc.check_liquidation_risk(
        entry_price, current_price, liq_price, "long"
    )
    for key, value in risk_assessment.items():
        print(f"  {key}: {value}")
