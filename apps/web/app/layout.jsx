import "@xyflow/react/dist/style.css";
import "../src/styles.css";

export const metadata = {
  title: "UnunuTV — 本地视频工作台",
  description: "Local-first AI video production workbench"
};

export default function RootLayout({ children }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
