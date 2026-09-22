import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function MerchCheckout({ artistId }: { artistId: string }) {
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [details, setDetails] = useState<Record<string, string>>({});
  const catalog = useQuery<any[]>({ queryKey: [`/api/merch/store/${encodeURIComponent(artistId)}`] });
  const checkout = useMutation({
    mutationFn: async () => {
      const payload = { buyerEmail: details.email, buyerName: details.name,
        shippingAddress: { line1: details.line1, city: details.city, state: details.state,
          postalCode: details.postalCode, country: details.country?.toUpperCase() },
        items: [{ itemId: selected, quantity }] };
      const fingerprint = JSON.stringify(payload);
      const previous = JSON.parse(sessionStorage.getItem("merch-checkout-command") || "null");
      const commandKey = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID();
      sessionStorage.setItem("merch-checkout-command", JSON.stringify({ fingerprint, key: commandKey }));
      const response = await apiRequest("POST", "/api/merch/checkout", { ...payload, commandKey });
      return response.json();
    },
    onSuccess: data => { window.location.assign(data.checkoutUrl); },
  });
  return <section className="mx-auto max-w-2xl space-y-5 p-6">
    <h1 className="text-2xl font-bold">Artist merchandise</h1>
    <p>Physical products. Shipping and taxes are confirmed at payment checkout.</p>
    {catalog.isLoading && <p>Loading merchandise…</p>}
    {catalog.error && <p role="alert">{catalog.error.message}</p>}
    <select className="w-full rounded border p-3 bg-background" value={selected}
      onChange={event => setSelected(event.target.value)}>
      <option value="">Choose a product</option>
      {catalog.data?.map(item => <option key={item.id} value={item.id}
        disabled={item.inventory < 1 || item.variants?.length > 0}>
        {item.name} — ${Number(item.salePrice ?? item.price).toFixed(2)}
        {item.variants?.length > 0 ? " (variant checkout not yet configured)" : ""}
      </option>)}
    </select>
    <label className="block">Quantity<Input type="number" min={1} max={100} value={quantity}
      onChange={event => setQuantity(Number(event.target.value))} /></label>
    {(["name", "email", "line1", "city", "state", "postalCode", "country"] as const).map(field =>
      <label className="block" key={field}>{({ name: "Full name", email: "Email", line1: "Street address",
        city: "City", state: "State / region", postalCode: "Postal code", country: "Country (2-letter code)" })[field]}
        <Input value={details[field] ?? ""} type={field === "email" ? "email" : "text"}
          onChange={event => setDetails({ ...details, [field]: event.target.value })} />
      </label>)}
    {checkout.error && <p role="alert">{checkout.error.message}</p>}
    <Button disabled={!selected || checkout.isPending || Object.keys(details).length < 7}
      onClick={() => checkout.mutate()}>Continue to payment</Button>
  </section>;
}