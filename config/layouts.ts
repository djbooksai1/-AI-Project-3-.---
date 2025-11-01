
export interface Layout {
    name: string;
    className: string;
}

export const layouts: Layout[] = [
    { name: '기본', className: 'layout-default' },
    { name: '컴팩트', className: 'layout-compact' },
    { name: '박스형', className: 'layout-boxed' },
    { name: '좌우 분할', className: 'layout-side-by-side' },
    { name: '미니멀', className: 'layout-minimal' },
    { name: '학술', className: 'layout-academic' },
    { name: '노트북', className: 'layout-notebook' },
    { name: '집중 모드', className: 'layout-focus' },
    { name: '타임라인', className: 'layout-timeline' },
    { name: '그리드', className: 'layout-grid' },
];
