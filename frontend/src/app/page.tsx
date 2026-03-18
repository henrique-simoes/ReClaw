import dynamic from "next/dynamic";

const HomeClient = dynamic(() => import("@/components/layout/HomeClient"), {
  ssr: false,
});

export default function Home() {
  return <HomeClient />;
}
