(function initDashboardCharts(global) {
  function metricLabel(metric) {
    return metric
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (v) => v.toUpperCase());
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      plugins: { legend: { labels: { boxWidth: 10 } } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true }
      }
    };
  }

  function createOrUpdate(chartRef, ctx, config) {
    if (chartRef && typeof chartRef.destroy === "function") {
      chartRef.destroy();
    }
    return new Chart(ctx, config);
  }

  function createManager() {
    const state = { line: null, bar: null, donut: null };

    function renderLine(canvas, payload, metric) {
      state.line = createOrUpdate(state.line, canvas.getContext("2d"), {
        type: "line",
        data: {
          labels: payload.line.map((x) => x.logDate.slice(5)),
          datasets: [
            {
              label: `${metricLabel(metric)} count`,
              data: payload.line.map((x) => x.value),
              borderColor: "#2d73c7",
              backgroundColor: "rgba(45, 115, 199, 0.08)",
              pointRadius: 2,
              tension: 0.25
            }
          ]
        },
        options: baseOptions()
      });
    }

    function renderBar(canvas, payload, metric) {
      state.bar = createOrUpdate(state.bar, canvas.getContext("2d"), {
        type: "bar",
        data: {
          labels: payload.bar.map((x) => x.logDate.slice(5)),
          datasets: [
            {
              label: `${metricLabel(metric)} points`,
              data: payload.bar.map((x) => x.points),
              backgroundColor: "rgba(26, 153, 168, 0.65)",
              borderRadius: 5
            }
          ]
        },
        options: baseOptions()
      });
    }

    function renderDonut(canvas, payload) {
      state.donut = createOrUpdate(state.donut, canvas.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: payload.donut.map((x) => metricLabel(x.metric)),
          datasets: [
            {
              data: payload.donut.map((x) => x.points),
              backgroundColor: [
                "#194586",
                "#2662af",
                "#2c84c8",
                "#23a2a8",
                "#65a2d6",
                "#3a7f8f",
                "#8aa4bf"
              ]
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } }
        }
      });
    }

    function renderAll(canvasMap, payload, metric) {
      renderLine(canvasMap.line, payload, metric);
      renderBar(canvasMap.bar, payload, metric);
      renderDonut(canvasMap.donut, payload);
    }

    return { renderAll };
  }

  global.DashboardCharts = { createManager };
})(window);
