import type { WidgetDef } from "./core";

export const widgetFixtures: WidgetDef[] = [
  {
    stem: "Ring up 2 Coffees and 1 Croissant, then apply the 10% staff discount. Report the total.",
    widget: "pos-demo",
    config: { menu: [{ name: "Coffee", price: 3 }, { name: "Croissant", price: 4 }, { name: "Juice", price: 5 }], discounts: [0, 10, 20] },
    checks: [
      { kind: "number", id: "total", label: "Order total", path: "total", expected: 9, abs: 0.01 },
      { kind: "number", id: "lines", label: "Lines on the order", path: "order.length", expected: 2, abs: 0 },
      { kind: "number", id: "disc", label: "Discount applied (%)", path: "discountPct", expected: 10, abs: 0 },
    ],
    solution: { order: [{ name: "Coffee", qty: 2, price: 3 }, { name: "Croissant", qty: 1, price: 4 }], discountPct: 10, total: 9 },
  },
];
