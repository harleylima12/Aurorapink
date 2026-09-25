/** ECharts montado só com o que o app usa (bundle menor), com o tema escuro registrado. */
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { AriaComponent, GridComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import { NOME_TEMA, TEMA_ECHARTS } from './tema';

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, MarkAreaComponent, AriaComponent, CanvasRenderer]);
echarts.registerTheme(NOME_TEMA, TEMA_ECHARTS);

export { echarts };
