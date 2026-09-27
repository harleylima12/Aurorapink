/**
 * Módulos do ECharts só dos gráficos por tema (Fase 5C): mapa de calor, treemap, funil, caixa, legenda, linha de
 * referência e escala de cor. Importado pelo Modo Universal (carregado sob demanda): a demo da Olist não paga por eles.
 */
import { BoxplotChart, FunnelChart, HeatmapChart, TreemapChart } from 'echarts/charts';
import { LegendComponent, MarkLineComponent, VisualMapComponent } from 'echarts/components';

import { echarts } from './echarts';

echarts.use([HeatmapChart, TreemapChart, FunnelChart, BoxplotChart, LegendComponent, MarkLineComponent, VisualMapComponent]);
