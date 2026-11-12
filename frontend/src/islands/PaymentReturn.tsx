import { useEffect, useState } from "react";
import { api, errorText } from "../lib/api";
import { restoreAside } from "../lib/basket";
import type { OrderView } from "../lib/types";

/** /payment/failed and /payment/cancelled: ask the server what Cashflows says, then put the basket back. */
export default function PaymentReturn({ number, leftAs }: { number: string; leftAs: "failed" | "cancelled" }) {
  const [state, setState] = useState<"checking" | "paid" | "closed" | "error">("checking");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!number) { setState("closed"); return; }
    api<OrderView>(`/api/orders/${encodeURIComponent(number)}/return`, { json: { leftAs } })
      .then((o) => {
        if (o.status === "paid") { window.location.replace(`/order/${encodeURIComponent(number)}`); setState("paid"); return; }
        restoreAside(number);
        setState("closed");
      })
      .catch((e) => { setMsg(errorText(e)); restoreAside(number); setState("error"); });
  }, [number, leftAs]);
  if (state === "checking" || state === "paid") return <div className="card empty"><span className="spin" /> Checking with the payment provider…</div>;
  return (
    <div className="card card-p stack g12" style={{ alignItems: "center", textAlign: "center" }} data-testid="payment-return">
      <div className="h3">{leftAs === "cancelled" ? "Payment Cancelled" : "Payment Didn’t Go Through"}</div>
      <p className="p">No money was taken by card and no tickets were issued. Anything taken from your wallet for this order has gone back, and your basket is just as you left it.</p>
      {msg && <p className="hint">{msg}</p>}
      <div className="r2" style={{ width: "100%" }}><a className="btn btn-y" href="/basket">Try Again</a><a className="btn btn-o" href="/contact">Get Help</a></div>
    </div>
  );
}
