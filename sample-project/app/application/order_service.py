"""
Application Layer: Use cases and business workflow orchestration.
Allowed to depend on Domain layer. Forbidden from depending on Presentation.
"""
from app.domain.order import Order

class OrderService:
    def place_order(self, customer_id: str, item: str, price: float) -> Order:
        order = Order(customer_id=customer_id, item_name=item, price=price)
        order.calculate_tax_and_total()
        return order
