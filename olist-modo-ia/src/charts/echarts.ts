/** ECharts montado só com o que o app usa (bundle menor), com o tema escuro registrado. */
import { BarChart, BoxplotChart, FunnelChart, HeatmapChart, LineChart, ScatterChart, TreemapChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import { NOME_TEMA, TEMA_ECHARTS } from './tema';

// Fase 5C: mapa de calor, treemap, funil e caixa (gráficos por tema), com legenda, linha de referência e escala de cor.
echarts.use([
  BarChart, LineChart, ScatterChart, HeatmapChart, TreemapChart, FunnelChart, BoxplotChart,
  GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LegendComponent, VisualMapComponent, AriaComponent, CanvasRenderer,
]);
echarts.registerTheme(NOME_TEMA, TEMA_ECHARTS);

export { echarts };
