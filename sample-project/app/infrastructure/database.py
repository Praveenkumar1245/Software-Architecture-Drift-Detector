"""
Infrastructure Layer: Database persistence and adapters.
Allowed to depend on Domain entities.
"""
from app.domain.order import Order

class OrderRepository:
    def __init__(self):
        self._db = {}

    def save(self, order: Order) -> None:
        self._db[order.id] = {
            "id": order.id,
            "customer_id": order.customer_id,
            "item_name": order.item_name,
            "price": order.price,
            "total": order.total
        }

    def get_by_id(self, order_id: str) -> Order | None:
        data = self._db.get(order_id)
        if not data:
            return None
        order = Order(data["customer_id"], data["item_name"], data["price"])
        order.id = data["id"]
        order.total = data["total"]
        return order
