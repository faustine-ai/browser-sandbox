import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Eyebrow } from "@/components/ui";
import { Playground } from "@/components/playground/Playground";
import { PACKAGE } from "@/lib/links";

const TITLE = "Try it";
const DESCRIPTION =
  "Run code in the browser sandbox, in this page: edit the functions the host exposes, edit the code an agent would write, run it and read the result, the console and every call that crossed the bridge.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/try" },
  openGraph: { title: `${TITLE} — browser-sandbox`, description: DESCRIPTION, url: "/try" },
  twitter: { title: `${TITLE} — browser-sandbox`, description: DESCRIPTION },
};

/**
 * The try-out page. Everything happens in the visitor's browser with the
 * published package: the functions editor is the host side (it runs in the
 * page, like a real integration), the agent code runs in the sandbox.
 */
export default function TryPage() {
  return (
    <>
      <Nav solid />
      <main className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 pt-24 pb-20 sm:px-7">
          <Eyebrow>Try it · in this page</Eyebrow>
          <h1 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.032em] text-zinc-900 sm:text-[2.4rem]">
            Run code in the sandbox
          </h1>
          <p className="mt-4 max-w-3xl text-[1.02rem] leading-relaxed text-zinc-600">
            The left side is yours: the functions a host hands to the sandbox, running in this page against mocked data, and the
            code an agent would write against them. Press Run and the code executes in a Worker inside an opaque-origin frame,
            through <code className="rounded-md bg-iris-50 px-1.5 py-0.5 font-mono text-[0.86em] text-iris-900">{PACKAGE}</code> as
            installed from npm. The right side is the <code className="rounded-md bg-iris-50 px-1.5 py-0.5 font-mono text-[0.86em] text-iris-900">RunResult</code>:
            value or error, the console, every call and its decision.
          </p>
          <p className="mt-3 max-w-3xl text-[0.9rem] leading-relaxed text-zinc-500">
            Pick an example to see approval, the busy-loop watchdog, the call cap or what an escape attempt finds. Nothing leaves your
            browser.
          </p>

          <div className="mt-10">
            <Playground />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
