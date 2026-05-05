import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Minus, Undo, Redo,
} from "lucide-react";
import "./rich-text-editor.css";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        horizontalRule: {},
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Escribe la descripción del evento..." }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "prose prose-sm prose-invert max-w-none focus:outline-none min-h-[160px] px-3 py-2",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // Treat an empty doc as empty string so the form can detect no content
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  if (!editor) return null;

  return (
    <div className={cn("rounded-md border border-input bg-transparent text-sm shadow-sm", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 border-b border-border px-1.5 py-1">
        <Toggle
          size="sm"
          pressed={editor.isActive("bold")}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Negrita"
        >
          <Bold />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("italic")}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Cursiva"
        >
          <Italic />
        </Toggle>

        <div className="w-px bg-border mx-0.5 self-stretch" />

        <Toggle
          size="sm"
          pressed={editor.isActive("heading", { level: 2 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Título"
        >
          <Heading2 />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("heading", { level: 3 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Subtítulo"
        >
          <Heading3 />
        </Toggle>

        <div className="w-px bg-border mx-0.5 self-stretch" />

        <Toggle
          size="sm"
          pressed={editor.isActive("bulletList")}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Lista con viñetas"
        >
          <List />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("orderedList")}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Lista numerada"
        >
          <ListOrdered />
        </Toggle>

        <div className="w-px bg-border mx-0.5 self-stretch" />

        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
          aria-label="Separador"
        >
          <Minus />
        </Toggle>

        <div className="w-px bg-border mx-0.5 self-stretch" />

        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          aria-label="Deshacer"
        >
          <Undo />
        </Toggle>
        <Toggle
          size="sm"
          pressed={false}
          onPressedChange={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          aria-label="Rehacer"
        >
          <Redo />
        </Toggle>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
