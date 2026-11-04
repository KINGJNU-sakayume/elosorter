import { Settings } from 'lucide-react';

/**
 * 설정을 여는 톱니 버튼. Life Hub가 「확인 필요」(상태 C)이면 오른쪽 위에 지름 8px 경고색 점을 그리고
 * 접근성 이름 끝에 「 (확인 필요)」를 붙인다.
 */
export default function SettingsButton({ onClick, label, attention, className, iconSize }: {
  onClick: () => void;
  label: string;
  attention: boolean;
  className: string;
  iconSize: number;
}) {
  const name = attention ? `${label} (확인 필요)` : label;
  return (
    <button type="button" onClick={onClick} aria-label={name} title={name} className={`relative ${className}`}>
      <Settings size={iconSize} aria-hidden />
      {attention && <span data-attention aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-warn" />}
    </button>
  );
}
