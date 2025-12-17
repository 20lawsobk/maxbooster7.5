/**
 * TODO: Add function documentation
 */
export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
      <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
