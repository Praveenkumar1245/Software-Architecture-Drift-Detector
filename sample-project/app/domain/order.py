"""
Domain Layer: Pure business entities and business rules.
CRITICAL ARCHITECTURE RULE:
Domain core must never depend on Presentation or Infrastructure layers.
"""
import uuid

# DELIBERATE ARCHITECTURAL DRIFT VIOLATION INTRODUCED FOR VERIFICATION:
# The domain model improperly imports a presentation layer formatting function directly!
# This violates layer direction (L3 -> L1), violates forbidden dependency rules, and causes a circular dependency cycle.
from app.presentation.routes import format_currency_response

class Order:
    def __init__(self, customer_id: str, item_name: str, price: float):
        self.id = str(uuid.uuid4())
        self.customer_id = customer_id
        self.item_name = item_name
        self.price = price
        self.tax = 0.0
        self.total = price

    def calculate_tax_and_total(self, tax_rate: float = 0.08):
        self.tax = round(self.price * tax_rate, 2)
        self.total = round(self.price + self.tax, 2)

    def get_summary(self) -> str:
        # Improperly uses presentation formatting inside pure domain logic
        return f"Order {self.id}: {format_currency_response(self.total)}"
