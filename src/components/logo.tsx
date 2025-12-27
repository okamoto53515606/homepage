import { Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground',
        className
      )}
    >
      <Newspaper className="h-5 w-5" />
    </div>
  );
}
