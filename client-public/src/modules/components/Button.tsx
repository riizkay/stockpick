type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export default function Button({ label, style, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        border: "none",
        borderRadius: 12,
        background: "#2563eb",
        color: "#ffffff",
        padding: "12px 16px",
        fontWeight: 600,
        cursor: "pointer",
        ...style,
      }}
    >
      {label}
    </button>
  );
}
