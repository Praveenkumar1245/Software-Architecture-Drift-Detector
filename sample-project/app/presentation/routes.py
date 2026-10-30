"""
Presentation Layer: Routes and API handlers.
Expected to call Application layer services.
"""
from app.application.order_service import OrderService

def format_currency_response(amount: float) -> str:
    """Helper formatter in presentation layer."""
    return f"${amount:,.2f}"

class OrderController:
    def __init__(self):
        self.service = OrderService()

    def handle_create_order(self, customer_id: str, item: str, price: float) -> dict:
        order = self.service.place_order(customer_id, item, price)
        return {
            "order_id": order.id,
            "status": "created",
            "formatted_total": format_currency_response(order.total)
        }
