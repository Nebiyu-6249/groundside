import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
      <h1 className="text-xl font-semibold">This page does not exist</h1>
      <p className="mt-2">The link may be mistyped, or a judge demo may have expired (each one lasts 24 hours).</p>
      <p className="mt-6"><Link href="/" className="underline underline-offset-4">Back to the start</Link></p>
    </main>
  );
}
