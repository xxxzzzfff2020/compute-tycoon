import { ORDER_QUEUE_CAP } from "../data/content";
import type { OrderState } from "./types";

/** 固定订单处理线编号：0..3 分别对应 100% / 50% / 25% / 12.5%。 */
export function isOrderSlotIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < ORDER_QUEUE_CAP;
}

/**
 * 为旧档及异常档稳定补齐固定槽位。
 *
 * - 合法且同订单内唯一的槽位原样保留；
 * - 缺失、重复或越界项按当前数组顺序填入首个空槽；
 * - 超出四项的异常订单不伪造第五条处理线，保持无槽位并由既有容量规则阻止继续接单。
 */
export function normalizeOrderSlotAssignments(activeOrders: OrderState[]): boolean {
  const usedByOrder = new Map<string, Set<number>>();
  const pending: OrderState[] = [];
  let changed = false;

  for (const order of activeOrders) {
    const used = usedByOrder.get(order.orderId) ?? new Set<number>();
    usedByOrder.set(order.orderId, used);
    if (isOrderSlotIndex(order.slotIndex) && !used.has(order.slotIndex)) {
      used.add(order.slotIndex);
      continue;
    }
    if (order.slotIndex !== undefined) {
      delete order.slotIndex;
      changed = true;
    }
    pending.push(order);
  }

  for (const order of pending) {
    const used = usedByOrder.get(order.orderId)!;
    const slotIndex = Array.from({ length: ORDER_QUEUE_CAP }, (_, index) => index)
      .find((index) => !used.has(index));
    if (slotIndex === undefined) continue;
    order.slotIndex = slotIndex;
    used.add(slotIndex);
    changed = true;
  }

  return changed;
}

export function firstFreeOrderSlot(activeOrders: readonly OrderState[], orderId: string): number | null {
  const used = new Set(
    activeOrders
      .filter((order) => order.orderId === orderId && isOrderSlotIndex(order.slotIndex))
      .map((order) => order.slotIndex as number),
  );
  for (let index = 0; index < ORDER_QUEUE_CAP; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}
