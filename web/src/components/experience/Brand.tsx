import Link from "next/link";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand ${compact ? "brand--compact" : ""}`} aria-label="CivicSim home">
      <span className="brand__mark"><i /><i /><i /></span>
      <span className="brand__word">CIVIC<span>SIM</span></span>
    </Link>
  );
}
