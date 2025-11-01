
export interface Theme {
  name: string;
  colors: {
    'background': string;
    'surface': string;
    'primary': string;
    'accent': string;
    'accent-hover': string;
    'danger': string;
    'success': string;
    'text-primary': string;
    'text-secondary': string;
  };
}

export const themes: Theme[] = [
    {
        name: 'Default Dark',
        colors: {
            'background': '#121212',
            'surface': '#1e1e1e',
            'primary': '#333333',
            'accent': '#00aaff',
            'accent-hover': '#0088cc',
            'danger': '#ff4444',
            'success': '#00c851',
            'text-primary': '#e0e0e0',
            'text-secondary': '#a0a0a0',
        }
    },
    {
        name: 'Midnight Blue',
        colors: {
            'background': '#0f172a',
            'surface': '#1e293b',
            'primary': '#334155',
            'accent': '#38bdf8',
            'accent-hover': '#0ea5e9',
            'danger': '#f43f5e',
            'success': '#4ade80',
            'text-primary': '#e2e8f0',
            'text-secondary': '#94a3b8',
        }
    },
    {
        name: 'Forest',
        colors: {
            'background': '#1a201f',
            'surface': '#2d332a',
            'primary': '#414a3c',
            'accent': '#6a994e',
            'accent-hover': '#5a8a3e',
            'danger': '#bc4749',
            'success': '#a7c957',
            'text-primary': '#f2e8cf',
            'text-secondary': '#a9b2a2',
        }
    },
    {
        name: 'Dracula',
        colors: {
            'background': '#282a36',
            'surface': '#44475a',
            'primary': '#6272a4',
            'accent': '#bd93f9',
            'accent-hover': '#aa82e8',
            'danger': '#ff5555',
            'success': '#50fa7b',
            'text-primary': '#f8f8f2',
            'text-secondary': '#bd93f9',
        }
    },
    {
        name: 'Solarized Light',
        colors: {
            'background': '#fdf6e3',
            'surface': '#eee8d5',
            'primary': '#93a1a1',
            'accent': '#268bd2',
            'accent-hover': '#1f72b0',
            'danger': '#dc322f',
            'success': '#859900',
            'text-primary': '#657b83',
            'text-secondary': '#586e75',
        }
    },
    {
        name: 'Paper',
        colors: {
            'background': '#f8f5f0',
            'surface': '#ffffff',
            'primary': '#e0dcd1',
            'accent': '#d95a2b',
            'accent-hover': '#c8491a',
            'danger': '#d92b2b',
            'success': '#2bd98a',
            'text-primary': '#433b32',
            'text-secondary': '#8a7f72',
        }
    },
    {
        name: 'Nord',
        colors: {
            'background': '#2E3440',
            'surface': '#3B4252',
            'primary': '#434C5E',
            'accent': '#88C0D0',
            'accent-hover': '#81A1C1',
            'danger': '#BF616A',
            'success': '#A3BE8C',
            'text-primary': '#ECEFF4',
            'text-secondary': '#D8DEE9',
        }
    },
    {
        name: 'Monokai',
        colors: {
            'background': '#272822',
            'surface': '#3e3d32',
            'primary': '#75715e',
            'accent': '#a6e22e',
            'accent-hover': '#f92672',
            'danger': '#f92672',
            'success': '#a6e22e',
            'text-primary': '#f8f8f2',
            'text-secondary': '#75715e',
        }
    },
    {
        name: 'GitHub Light',
        colors: {
            'background': '#ffffff',
            'surface': '#f6f8fa',
            'primary': '#e1e4e8',
            'accent': '#0366d6',
            'accent-hover': '#005cc5',
            'danger': '#d73a49',
            'success': '#28a745',
            'text-primary': '#24292e',
            'text-secondary': '#586069',
        }
    },
    {
        name: 'Rosé Pine',
        colors: {
            'background': '#191724',
            'surface': '#1f1d2e',
            'primary': '#3e3a53',
            'accent': '#eb6f92',
            'accent-hover': '#c4a7e7',
            'danger': '#eb6f92',
            'success': '#9ccfd8',
            'text-primary': '#e0def4',
            'text-secondary': '#908caa',
        }
    }
];
