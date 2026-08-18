import { redirect } from "next/navigation";

// Single-product build: the root goes straight to the WRE (real-estate) bot.
// Unauthenticated requests are bounced to /login by the middleware.
export default function Home() {
  redirect("/wre");
}
