import { convertImagesToPNG, needsConversion } from "@/lib/utils/imageConversion";
import { modelSupportsVision, type ModelCatalog } from "@/lib/models";
import { useState, useRef } from "react";
import { ArrowUp, Image, X, Square, Mic, Sparkles, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "./ModelSelector";
import { useToast } from "@/hooks/use-toast";
import { transcribeAudio } from "@/lib/speech";
import { extractText } from "@/lib/ocr";
import { checkAuthStatus } from "@/lib/puter";


interface ChatInputProps {
  onSend: (message: string, model?: string, images?: File[]) => void;
  onStop?: () => void;
  onGenerateImage?: (prompt: string) => Promise<void>;
  isGeneratingImage?: boolean;
  disabled?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelCatalog?: ModelCatalog | null;
}

export const ChatInput = ({ onSend, onStop, onGenerateImage, isGeneratingImage, disabled, selectedModel, onModelChange, modelCatalog }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);  // For attaching images to messages
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [ocrIndex, setOcrIndex] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if ((input.trim() || selectedImages.length > 0) && !disabled && !isUploading) {
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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length > 0) {
      setIsProcessingImages(true);
      const validFiles = files.filter(file => file.type.startsWith('image/'));

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

      // Auto-convert unsupported formats (AVIF, HEIC, etc.) to PNG
      const needsConversionFiles = validFiles.filter(file => needsConversion(file.type));

      let filesToUse = validFiles;
      if (needsConversionFiles.length > 0) {
        const formatNames = needsConversionFiles.map(f => f.type.replace('image/', '').toUpperCase()).join(', ');
        toast({
          title: "Converting images",
          description: `Converting ${formatNames} to PNG format...`,
          duration: 3000,
        });

        try {
          filesToUse = await convertImagesToPNG(validFiles);
          toast({
            title: "Conversion complete",
            description: `Successfully converted ${needsConversionFiles.length} image(s) to PNG`,
            duration: 2000,
          });
        } catch (error) {
          toast({
            title: "Conversion failed",
            description: error instanceof Error ? error.message : "Failed to convert images",
            variant: "destructive",
            duration: 5000,
          });
          setIsProcessingImages(false);
          return;
        }
      }

      setSelectedImages(prev => [...prev, ...filesToUse].slice(0, 4)); // Max 4 images

      let processedCount = 0;
      filesToUse.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setImagePreviews(prev => [...prev, result].slice(0, 4));
          processedCount++;

          if (processedCount === validFiles.length) {
            setIsProcessingImages(false);
          }
        };
        reader.onerror = () => {
          processedCount++;

          if (processedCount === validFiles.length) {
            setIsProcessingImages(false);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Reset image input
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
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

  const transcribeRecording = async (blob: Blob) => {
    setRecordingState("transcribing");
    try {
      const text = await transcribeAudio(blob);
      setInput((prev) => (prev ? prev + " " : "") + text);
    } catch (error) {
      toast({
        title: "Transcription failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setRecordingState("idle");
    }
  };

  const toggleRecording = async () => {
    if (recordingState === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (recordingState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Voice input unavailable",
        description: "Microphone access needs a secure context (localhost or HTTPS).",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void transcribeRecording(new Blob(audioChunksRef.current, { type: recorder.mimeType }));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingState("recording");
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Allow microphone access to use voice input.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const submitImagePrompt = () => {
    const prompt = imagePrompt.trim();
    if (!prompt || isGeneratingImage || !onGenerateImage) return;
    setImagePrompt("");
    setShowImagePrompt(false);
    void onGenerateImage(prompt);
  };

  const extractFromImage = async (index: number) => {
    const file = selectedImages[index];
    if (!file || ocrIndex !== null) return;
    if (!checkAuthStatus()) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to Puter to extract text.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    setOcrIndex(index);
    try {
      const text = await extractText(file);
      setInput((prev) => (prev ? prev + "\n\n" : "") + text);
      toast({ title: "Text extracted", duration: 2000 });
    } catch (error) {
      toast({
        title: "Text extraction failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setOcrIndex(null);
    }
  };

  // Vision support comes from the live model catalog (modalities data);
  // keyword matching is only the offline fallback inside modelSupportsVision.
  const modelSupportsImages = modelSupportsVision(selectedModel, modelCatalog ?? null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <form onSubmit={handleSubmit}>
        {/* Image previews */}
        {modelSupportsImages && imagePreviews.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="group relative">
                <img
                  src={preview}
                  alt={`Upload ${index + 1}`}
                  className="h-16 w-16 rounded-xl border border-border object-cover"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute -left-2 -top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => extractFromImage(index)}
                  disabled={ocrIndex !== null}
                  title="Extract text from image"
                >
                  {ocrIndex === index ? (
                    <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  ) : (
                    <ScanText className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute -right-2 -top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeImage(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showImagePrompt && onGenerateImage && (
          <div className="mb-2 flex items-center gap-2">
            <Input
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitImagePrompt(); } }}
              placeholder="Describe the image to generate..."
              disabled={isGeneratingImage}
              className="h-9"
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              onClick={submitImagePrompt}
              disabled={!imagePrompt.trim() || isGeneratingImage}
              className="shrink-0"
            >
              {isGeneratingImage ? (
                <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                "Generate"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowImagePrompt(false)}
              disabled={isGeneratingImage}
              className="shrink-0"
            >
              Cancel
            </Button>
          </div>
        )}

        <div className="rounded-[26px] border border-border bg-background shadow-sm transition-shadow focus-within:shadow-md">
          <Textarea
            id="chat-message-input"
            name="message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={modelSupportsImages ? "Message (images supported)…" : "Message AI Chat…"}
            aria-label="Message prompt"
            disabled={disabled}
            rows={1}
            className="max-h-[200px] min-h-[44px] resize-none border-0 bg-transparent px-5 pt-4 text-[15px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1">
              {onGenerateImage && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-muted-foreground"
                  onClick={() => setShowImagePrompt((v) => !v)}
                  disabled={disabled || isGeneratingImage}
                  title="Generate image"
                  aria-label="Generate image"
                >
                  {isGeneratingImage ? (
                    <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full text-muted-foreground"
                onClick={toggleRecording}
                disabled={disabled || recordingState === "transcribing"}
                title={recordingState === "recording" ? "Stop recording" : "Voice input"}
                aria-label={recordingState === "recording" ? "Stop voice recording" : "Start voice input"}
              >
                {recordingState === "transcribing" ? (
                  <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                ) : (
                  <Mic className={"h-4 w-4" + (recordingState === "recording" ? " text-destructive animate-pulse" : "")} aria-hidden="true" />
                )}
              </Button>
              {modelSupportsImages && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-muted-foreground"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={disabled || selectedImages.length >= 4 || isProcessingImages}
                  title="Attach images"
                  aria-label="Attach images"
                >
                  {isProcessingImages ? (
                    <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                  ) : (
                    <Image className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              )}
              {onModelChange && (
                <ModelSelector
                  selectedModel={selectedModel || "gpt-5.4-nano"}
                  onModelChange={onModelChange}
                />
              )}
            </div>
            {disabled && onStop ? (
              <Button
                type="button"
                size="icon"
                onClick={onStop}
                className="h-9 w-9 rounded-full"
                title="Stop generating"
                aria-label="Stop generating response"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && selectedImages.length === 0) || disabled}
                className="h-9 w-9 rounded-full"
                title="Send message"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        {modelSupportsImages && (
          <input
            id="chat-image-input"
            name="images"
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
        )}

        <p className="mt-2 text-center text-xs text-muted-foreground">
          AI can make mistakes. Check important info.
        </p>
      </form>
    </div>
  );
};
