import { notFound } from "next/navigation";
import DevPreviewClient from "./DevPreviewClient";

// Bileşenleri sahte veriyle gösteren geliştirme sayfası. Oturum ve veritabanı
// gerektirmediği için arayüz, gerçek veriye hiç dokunmadan kontrol edilebiliyor.
// Üretim derlemesinde kapalı.
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevPreviewClient />;
}
