export function Art({ kind, className = '' }: { kind: 'rocket' | 'mascot' | 'cat' | 'tiles' | 'quiz' | 'race' | 'defense'; className?: string }) {
  return <img src={`/art/${kind}.png`} className={`art art-${kind} ${className}`} alt={{ rocket: '로켓을 탄 보라색 캐릭터', mascot: '헤드폰을 쓴 숫자 친구', cat: '알파벳을 잡는 고양이', tiles: '초록색과 보라색 짝꿍', quiz: '지구본을 안고 있는 노란 부엉이', race: '보라색 카트를 타고 달리는 노란 부엉이', defense: '수정 지팡이를 든 마법사와 판타지 수비대' }[kind]} draggable={false} />;
}
