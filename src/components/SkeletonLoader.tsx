import { cn } from "@/lib/utils";

interface SkeletonLoaderProps {
  className?: string;
  lines?: number;
  showAvatar?: boolean;
}

export const SkeletonLoader = ({ className, lines = 3, showAvatar = true }: SkeletonLoaderProps) => {
  return (
    <div className={cn("w-full py-6 px-4 border-b border-border/50 animate-pulse", className)}>
      <div className="max-w-4xl mx-auto flex gap-4">
        {showAvatar && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted animate-pulse" />
        )}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-4 bg-muted rounded w-16 animate-pulse" />
            <div className="h-3 bg-muted/60 rounded w-12 animate-pulse" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: lines }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-4 bg-muted rounded animate-pulse",
                  i === lines - 1 ? "w-3/4" : "w-full"
                )}
                style={{
                  animationDelay: `${i * 100}ms`,
                  animationDuration: "1.5s"
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const MessageSkeleton = () => (
  <SkeletonLoader lines={4} showAvatar={false} className="bg-card/30" />
);

export const ChatInputSkeleton = () => (
  <div className="w-full max-w-4xl mx-auto px-4 py-6 bg-background border-t border-border">
    <div className="space-y-4">
      <div className="h-12 bg-muted rounded-2xl animate-pulse" />
      <div className="h-4 bg-muted/60 rounded w-1/3 mx-auto animate-pulse" />
    </div>
  </div>
);
