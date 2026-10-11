import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

function SkeletonSpinner({ className }: { className?: string }) {
  return <Skeleton className={cn("size-4 rounded-full bg-foreground/30", className)} />;
}

export { Skeleton, SkeletonSpinner };
