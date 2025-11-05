import { useState, useRef } from "react";
import { Send, Image, X, Plus, SlidersHorizontal, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "./ModelSelector";
import { useToast } from "@/hooks/use-toast";

interface ChatInputProps {
  onSend: (message: string, model?: string, images?: File[]) => void;
  disabled?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  currentModelName?: string; // Add prop for current model name
}

export const ChatInput = ({ onSend, disabled, selectedModel, onModelChange, currentModelName }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || selectedImages.length > 0) && !disabled) {
      console.log('ChatInput: Sending message with:', {
        content: input.trim(),
        model: selectedModel,
        imagesCount: selectedImages.length,
        images: selectedImages.map(img => img.name)
      });
      onSend(input.trim(), selectedModel, selectedImages);
      setInput("");
      clearImages();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    console.log('📁 ChatInput: Files selected:', files.length);
    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} (${file.size} bytes, ${file.type})`);
    });

    if (files.length > 0) {
      setIsProcessingImages(true);
      const validFiles = files.filter(file => file.type.startsWith('image/'));
      console.log(`✅ Valid image files: ${validFiles.length}/${files.length}`);

      if (validFiles.length === 0) {
        toast({
          title: "No valid images",
          description: "Please select image files only.",
          variant: "destructive",
          duration: 3000,
        });
        setIsProcessingImages(false);
        return;
      }

      setSelectedImages(prev => [...prev, ...validFiles].slice(0, 4)); // Max 4 images

      let processedCount = 0;
      validFiles.forEach((file, index) => {
        console.log(`🔄 Processing file ${index + 1}: ${file.name}`);
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          console.log(`✅ File ${file.name} loaded as data URL (${result.length} chars)`);
          setImagePreviews(prev => [...prev, result].slice(0, 4));
          processedCount++;

          if (processedCount === validFiles.length) {
            setIsProcessingImages(false);
            console.log(`✅ All ${validFiles.length} images processed successfully`);
          }
        };
        reader.onerror = () => {
          console.error(`❌ Failed to read file: ${file.name}`);
          processedCount++;

          if (processedCount === validFiles.length) {
            setIsProcessingImages(false);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearImages = () => {
    setSelectedImages([]);
    setImagePreviews([]);
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const isPerplexityModel = selectedModel?.startsWith("perplexity");
  const isGrokModel = selectedModel?.startsWith("x-ai");

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-0.5 md:py-1 bg-background border-t border-border">

      <form onSubmit={handleSubmit} className="space-y-2 md:space-y-2">
        {/* Image Previews - Only show for Perplexity models */}
        {isPerplexityModel && imagePreviews.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="relative group">
                <img
                  src={preview}
                  alt={`Upload ${index + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-border"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute -top-2 -right-2 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {selectedImages.length >= 4 && (
              <div className="w-16 h-16 rounded-lg border border-border bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Max 4</span>
              </div>
            )}
          </div>
        )}

        <div className="relative flex flex-col gap-0.5 bg-card border border-border rounded-2xl shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all duration-200 hover:shadow-lg p-0.5 md:p-1">
          <div className="flex-1">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModel?.startsWith("claude")
                  ? "Message Claude..."
                  : selectedModel?.startsWith("mistral")
                  ? "Message Mistral AI..."
                  : selectedModel?.startsWith("x-ai")
                  ? "Message Grok..."
                  : "How can I help you today?"
              }
              disabled={disabled}
              className="w-full min-h-[28px] md:min-h-[36px] max-h-[120px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent px-2 md:px-2 py-0.5 md:py-0.5 text-sm md:text-[15px] placeholder:text-muted-foreground/70 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between px-1 md:px-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                disabled={disabled}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                disabled={disabled}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                disabled={disabled}
              >
                <Timer className="w-3.5 h-3.5" />
              </Button>

              {isPerplexityModel && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || selectedImages.length >= 4}
                >
                  <Image className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onModelChange && (
                <div className="flex-shrink-0">
                  <ModelSelector
                    selectedModel={selectedModel || "claude-sonnet-4"}
                    onModelChange={onModelChange}
                  />
                </div>
              )}
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && selectedImages.length === 0) || disabled}
                className="rounded-xl bg-primary hover:bg-primary/90 h-6 w-6 md:h-6 md:w-6 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105 disabled:hover:scale-100"
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Hidden File Input */}
        {isPerplexityModel && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
        )}

        <div className="text-xs text-center text-muted-foreground/80 mt-4 px-2 flex items-center justify-center gap-1">
          {currentModelName && (
            <span className="font-medium text-foreground/90">{currentModelName}:</span>
          )}
          <span>
            {selectedModel?.startsWith("claude")
              ? "Claude can make mistakes. Consider checking important information."
              : selectedModel?.startsWith("mistral")
              ? "Mistral AI can make mistakes. Consider checking important information."
              : selectedModel?.startsWith("x-ai")
              ? "Grok can make mistakes. Consider checking important information."
              : "Perplexity AI provides research-oriented responses. Images supported for analysis."
            }
          </span>
        </div>
      </form>
    </div>
  );
};
