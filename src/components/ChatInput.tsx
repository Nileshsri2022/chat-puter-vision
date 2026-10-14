import { convertImagesToPNG, needsConversion } from "@/lib/utils/imageConversion";
import { cn } from "@/lib/utils";
import { modelSupportsVision, type ModelCatalog } from "@/lib/models";
import { useState, useRef } from "react";
import { ArrowUp, Paperclip, X, Square, Mic, Sparkles, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ModelSelector } from "./ModelSelector";
import { useToast } from "@/hooks/use-toast";
import { transcribeAudio } from "@/lib/speech";
import { extractText } from "@/lib/ocr";
import { checkAuthStatus } from "@/lib/backend";
import "./ChatInput.css";


interface ChatInputProps {
  onSend: (message: string, model?: string, images?: File[]) => void;
  onStop?: () => void;
  onGenerateImage?: (prompt: string) => Promise<void>;
  isGeneratingImage?: boolean;
  disabled?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  modelCatalog?: ModelCatalog | null;
  /** Prefills the textarea (inline edit mode). */
  initialValue?: string;
  /** Compact rendering for inline editing (shorter box, no outer padding). */
  compact?: boolean;
  /** Shows a Cancel button; used for inline editing. */
  onCancel?: () => void;
}

export const ChatInput = ({ onSend, onStop, onGenerateImage, isGeneratingImage, disabled, selectedModel, onModelChange, modelCatalog, initialValue, compact, onCancel }: ChatInputProps) => {
  const [input, setInput] = useState(initialValue ?? "");
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
    } else if (e.key === "Escape" && onCancel) {
      onCancel();
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
        description: "Please sign in to extract text.",
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
    <div className={cn("composer-wrap", compact && "composer-wrap-compact")}>
      <form onSubmit={handleSubmit} className="composer-form">
        {/* Image previews */}
        {modelSupportsImages && imagePreviews.length > 0 && (
          <div className="composer-previews">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="composer-preview group">
                <img
                  src={preview}
                  alt={`Upload ${index + 1}`}
                  className="composer-preview-img"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="composer-preview-ocr"
                  onClick={() => extractFromImage(index)}
                  disabled={ocrIndex !== null}
                  title="Extract text from image"
                >
                  {ocrIndex === index ? (
                    <div className="composer-mini-spinner" />
                  ) : (
                    <ScanText className="composer-mini-icon" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="composer-preview-remove"
                  onClick={() => removeImage(index)}
                >
                  <X className="composer-mini-icon" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showImagePrompt && onGenerateImage && (
          <div className="composer-imgprompt">
            <Input
              id="image-prompt-input"
              name="imagePrompt"
              aria-label="Image prompt"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitImagePrompt(); } }}
              placeholder="Describe the image to generate…"
              disabled={isGeneratingImage}
              className="composer-imgprompt-input"
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              onClick={submitImagePrompt}
              disabled={!imagePrompt.trim() || isGeneratingImage}
              className="composer-shrink"
              aria-label="Generate image"
            >
              {isGeneratingImage ? (
                <div className="composer-spinner" aria-hidden="true" />
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
              className="composer-shrink"
              aria-label="Cancel image generation"
            >
              Cancel
            </Button>
          </div>
        )}

        <div className="composer-box">
          <Textarea
            id={compact ? undefined : "chat-message-input"}
            name="message"
            aria-label="Message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={modelSupportsImages ? "Message (images supported)…" : "Message FreeTalk…"}
            disabled={disabled}
            rows={1}
            autoFocus={compact}
            className="composer-textarea"
          />
          <div className="composer-toolbar">
            <div className="composer-tools">
              {onGenerateImage && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="composer-tool-btn"
                  onClick={() => setShowImagePrompt((v) => !v)}
                  disabled={disabled || isGeneratingImage}
                  title="Generate image"
                  aria-label="Generate image"
                >
                  {isGeneratingImage ? (
                    <div className="composer-spinner" aria-hidden="true" />
                  ) : (
                    <Sparkles className="composer-tool-icon" aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="composer-tool-btn"
                onClick={toggleRecording}
                disabled={disabled || recordingState === "transcribing"}
                title={recordingState === "recording" ? "Stop recording" : "Voice input"}
                aria-label={recordingState === "recording" ? "Stop recording" : "Voice input"}
              >
                {recordingState === "transcribing" ? (
                  <div className="composer-spinner" aria-hidden="true" />
                ) : (
                  <Mic className={cn("composer-tool-icon", recordingState === "recording" && "composer-mic-recording")} aria-hidden="true" />
                )}
              </Button>
              {onModelChange && (
                <ModelSelector
                  selectedModel={selectedModel || "gpt-5.4-nano"}
                  onModelChange={onModelChange}
                />
              )}
            </div>
            <div className="composer-send-group">
{modelSupportsImages && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="composer-tool-btn"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={disabled || selectedImages.length >= 4 || isProcessingImages}
                  title="Attach images"
                  aria-label="Attach images"
                >
                  {isProcessingImages ? (
                    <div className="composer-spinner" aria-hidden="true" />
                  ) : (
                    <Paperclip className="composer-tool-icon" aria-hidden="true" />
                  )}
                </Button>
              )}
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="composer-cancel-btn"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
              {disabled && onStop ? (
                <Button
                  type="button"
                  size="icon"
                  onClick={onStop}
                  className="composer-send-btn"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square className="composer-tool-icon" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={(!input.trim() && selectedImages.length === 0) || disabled}
                  className="composer-send-btn"
                  title="Send message"
                  aria-label="Send message"
                >
                  <ArrowUp className="composer-tool-icon" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {modelSupportsImages && (
          <input
            id="image-file-input"
            name="images"
            aria-label="Attach images"
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="composer-hidden-input"
            onChange={handleImageSelect}
          />
        )}

      </form>
    </div>
  );
};
