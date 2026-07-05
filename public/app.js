(function () {
  const STATE_ENDPOINT = "/api/state";
  const UPLOAD_ENDPOINT = "/api/uploads";
  const app = document.querySelector("#app");
  const dialogHost = document.querySelector("#dialogHost");
  const importFile = document.querySelector("#importFile");

  const defaultState = {
    version: 1,
    dishes: [],
    fridge: [],
    plan: [],
  };

  let state = structuredClone(defaultState);
  let ui = {
    view: "recipes",
    selectedDishId: null,
    search: "",
    loading: true,
    error: "",
  };
  let saveQueue = Promise.resolve();

  init();

  document.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    const { action } = actionTarget.dataset;
    const id = actionTarget.dataset.id;
    const date = actionTarget.dataset.date;

    if (action === "switch-view") {
      ui.view = actionTarget.dataset.view;
      render();
      return;
    }

    if (action === "new-dish") {
      openDishDialog();
      return;
    }

    if (action === "edit-dish") {
      openDishDialog(id);
      return;
    }

    if (action === "delete-dish") {
      deleteDish(id);
      return;
    }

    if (action === "select-dish") {
      ui.selectedDishId = id;
      ui.view = "recipes";
      render();
      return;
    }

    if (action === "add-log") {
      openLogDialog(id);
      return;
    }

    if (action === "edit-log") {
      openLogDialog(actionTarget.dataset.dishId, id);
      return;
    }

    if (action === "delete-log") {
      deleteLog(actionTarget.dataset.dishId, id);
      return;
    }

    if (action === "add-today-plan") {
      setPlanDay(todayIso(), id);
      ui.view = "plan";
      render();
      return;
    }

    if (action === "generate-plan") {
      generateWeekPlan();
      render();
      return;
    }

    if (action === "clear-plan") {
      state.plan = [];
      saveState();
      render();
      return;
    }

    if (action === "remove-plan-day") {
      setPlanDay(date, "");
      render();
      return;
    }

    if (action === "remove-fridge") {
      state.fridge = state.fridge.filter((item) => item.id !== id);
      saveState();
      render();
      return;
    }

    if (action === "export-data") {
      exportData();
      return;
    }

    if (action === "import-data") {
      importFile.value = "";
      importFile.click();
      return;
    }

    if (action === "close-dialog") {
      closeDialog();
      return;
    }

    if (action === "add-ingredient-row") {
      actionTarget
        .closest("form")
        .querySelector('[data-list="ingredients"]')
        .insertAdjacentHTML("beforeend", ingredientRowTemplate());
      return;
    }

    if (action === "add-source-row") {
      actionTarget
        .closest("form")
        .querySelector('[data-list="sources"]')
        .insertAdjacentHTML("beforeend", sourceRowTemplate());
      return;
    }

    if (action === "remove-row") {
      actionTarget.closest("[data-row]")?.remove();
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    const formType = form.dataset.form;
    if (!formType) return;
    event.preventDefault();

    if (formType === "dish") {
      saveDishFromForm(form);
      return;
    }

    if (formType === "log") {
      await saveLogFromForm(form);
      return;
    }

    if (formType === "fridge") {
      saveFridgeFromForm(form);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-search]")) {
      ui.search = event.target.value;
      renderRecipesListOnly();
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("[data-plan-date]")) {
      setPlanDay(event.target.dataset.planDate, event.target.value);
      render();
      return;
    }

    if (event.target === importFile) {
      await importData(event.target.files?.[0]);
    }
  });

  function render() {
    if (ui.loading) {
      app.innerHTML = `
        <div class="app-shell">
          <header class="topbar">
            <div class="brand-block">
              <div class="brand">Eat Today</div>
              <div class="subtle">正在加载菜谱</div>
            </div>
          </header>
          <main class="workspace">
            <section class="panel">
              <div class="empty-state"><strong>正在加载</strong></div>
            </section>
          </main>
        </div>
      `;
      return;
    }

    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand-block">
            <div class="brand">Eat Today</div>
            <div class="subtle">${ui.error ? escapeHtml(ui.error) : `${state.dishes.length} 个菜 · ${totalLogs()} 次记录 · ${state.fridge.length} 个冰箱食材`}</div>
          </div>
          <div class="top-actions">
            <button class="secondary" type="button" data-action="import-data">导入</button>
            <button class="secondary" type="button" data-action="export-data">导出</button>
            <button class="primary" type="button" data-action="new-dish">新增菜谱</button>
          </div>
        </header>
        <nav class="tabbar" aria-label="主导航">
          ${tabButton("recipes", "菜谱")}
          ${tabButton("plan", "一周菜单")}
          ${tabButton("fridge", "冰箱")}
          ${tabButton("logs", "记录")}
        </nav>
        <main class="workspace">
          ${renderView()}
        </main>
      </div>
    `;
  }

  function renderView() {
    if (ui.view === "plan") return renderPlanView();
    if (ui.view === "fridge") return renderFridgeView();
    if (ui.view === "logs") return renderLogsView();
    return renderRecipesView();
  }

  function tabButton(view, label) {
    return `
      <button
        class="tab ${ui.view === view ? "active" : ""}"
        type="button"
        data-action="switch-view"
        data-view="${view}"
      >${label}</button>
    `;
  }

  function renderRecipesView() {
    const selected = getSelectedDish();
    return `
      <div class="split">
        <aside class="list-panel">
          <div class="panel-header">
            <span class="panel-title">菜谱</span>
            <button class="secondary" type="button" data-action="new-dish">新增</button>
          </div>
          <div class="search-box">
            <input data-search type="search" value="${escapeAttr(ui.search)}" placeholder="搜索菜名、标签、食材" />
          </div>
          <div id="recipeList">
            ${renderDishList()}
          </div>
        </aside>
        <section class="detail-panel">
          ${selected ? renderDishDetail(selected) : renderNoDish()}
        </section>
      </div>
    `;
  }

  function renderDishList() {
    const dishes = getFilteredDishes();
    if (!dishes.length) {
      return `
        <div class="empty-state">
          <strong>还没有匹配的菜</strong>
          <button class="primary" type="button" data-action="new-dish">新增菜谱</button>
        </div>
      `;
    }

    return `
      <div class="dish-list">
        ${dishes.map(renderDishCard).join("")}
      </div>
    `;
  }

  function renderRecipesListOnly() {
    const list = document.querySelector("#recipeList");
    if (!list) return;
    list.innerHTML = renderDishList();
  }

  function renderDishCard(dish) {
    const avg = averageRating(dish);
    const latest = latestLog(dish);
    const photo = latestPhoto(dish);
    return `
      <button
        class="dish-card ${dish.id === ui.selectedDishId ? "active" : ""}"
        type="button"
        data-action="select-dish"
        data-id="${escapeAttr(dish.id)}"
      >
        ${photo ? `<img class="thumb" src="${escapeAttr(photo)}" alt="${escapeAttr(dish.name)}" />` : `<span class="thumb-placeholder">${escapeHtml(initialOf(dish.name))}</span>`}
        <span class="dish-card-main">
          <span class="dish-name">${escapeHtml(dish.name)}</span>
          <span class="meta-line">
            <span>${avg ? `${avg.toFixed(1)} 分` : "未评分"}</span>
            <span>${dish.ingredients.length} 种食材</span>
            <span>${latest ? formatShortDate(latest.date) : "未做过"}</span>
          </span>
        </span>
      </button>
    `;
  }

  function renderDishDetail(dish) {
    const avg = averageRating(dish);
    const latest = latestLog(dish);
    return `
      <div class="dish-heading">
        <div>
          <h1>${escapeHtml(dish.name)}</h1>
          <div class="tag-row">
            ${dish.category ? `<span class="tag">${escapeHtml(dish.category)}</span>` : ""}
            ${dish.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
        <div class="row-actions">
          <button class="secondary" type="button" data-action="add-today-plan" data-id="${escapeAttr(dish.id)}">今天做</button>
          <button class="secondary" type="button" data-action="add-log" data-id="${escapeAttr(dish.id)}">记录</button>
          <button class="secondary" type="button" data-action="edit-dish" data-id="${escapeAttr(dish.id)}">编辑</button>
          <button class="danger" type="button" data-action="delete-dish" data-id="${escapeAttr(dish.id)}">删除</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">${avg ? avg.toFixed(1) : "-"}</span>
          <span class="stat-label">平均评分</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${dish.logs.length}</span>
          <span class="stat-label">做过次数</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${dish.sources.length}</span>
          <span class="stat-label">来源</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${latest ? formatShortDate(latest.date) : "-"}</span>
          <span class="stat-label">最近一次</span>
        </div>
      </div>

      <section class="section-block">
        <h2>食材</h2>
        ${
          dish.ingredients.length
            ? `<div class="ingredient-grid">${dish.ingredients.map(renderIngredient).join("")}</div>`
            : `<div class="empty-state"><strong>未填写食材</strong></div>`
        }
      </section>

      <section class="section-block">
        <h2>做法</h2>
        <p class="method-text">${escapeHtml(dish.method || "未填写做法")}</p>
      </section>

      <section class="section-block">
        <h2>来源</h2>
        ${
          dish.sources.length
            ? `<div class="source-list">${dish.sources.map(renderSource).join("")}</div>`
            : `<div class="empty-state"><strong>未添加来源</strong></div>`
        }
      </section>

      <section class="section-block">
        <div class="panel-header">
          <h2>做饭记录</h2>
          <button class="secondary" type="button" data-action="add-log" data-id="${escapeAttr(dish.id)}">新增记录</button>
        </div>
        ${
          dish.logs.length
            ? `<div class="log-list">${sortLogs(dish.logs).map((log) => renderLogCard(log, dish)).join("")}</div>`
            : `<div class="empty-state"><strong>还没有记录</strong><button class="primary" type="button" data-action="add-log" data-id="${escapeAttr(dish.id)}">记录这次</button></div>`
        }
      </section>
    `;
  }

  function renderIngredient(ingredient) {
    const amount = [ingredient.amount, ingredient.unit].filter(Boolean).join(" ");
    return `
      <div class="ingredient-row">
        ${amount ? `<span class="amount">${escapeHtml(amount)}</span>` : ""}
        <strong>${escapeHtml(ingredient.name)}</strong>
      </div>
    `;
  }

  function renderSource(source) {
    const url = safeUrl(source.url);
    return `
      <div class="source-row">
        <div>
          <div class="source-type">${escapeHtml(source.type)}</div>
          <strong>${escapeHtml(source.title || source.url || "未命名来源")}</strong>
          ${source.notes ? `<div class="subtle">${escapeHtml(source.notes)}</div>` : ""}
        </div>
        ${url ? `<a class="secondary button-link" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">打开</a>` : ""}
      </div>
    `;
  }

  function renderLogCard(log, dish) {
    return `
      <article class="log-card">
        <div class="log-head">
          <div>
            <strong>${escapeHtml(formatDate(log.date))}</strong>
            <span class="pill">${Number(log.rating || 0)} 分</span>
          </div>
          <div class="row-actions">
            <button class="ghost" type="button" data-action="edit-log" data-dish-id="${escapeAttr(dish.id)}" data-id="${escapeAttr(log.id)}">编辑</button>
            <button class="ghost" type="button" data-action="delete-log" data-dish-id="${escapeAttr(dish.id)}" data-id="${escapeAttr(log.id)}">删除</button>
          </div>
        </div>
        ${log.notes ? `<p class="note-text">${escapeHtml(log.notes)}</p>` : ""}
        ${log.photos?.length ? `<div class="photo-grid">${log.photos.map((photo) => `<img src="${escapeAttr(photo)}" alt="${escapeAttr(dish.name)} 记录照片" />`).join("")}</div>` : ""}
      </article>
    `;
  }

  function renderNoDish() {
    return `
      <div class="empty-state">
        <strong>还没有菜谱</strong>
        <button class="primary" type="button" data-action="new-dish">新增第一个菜</button>
      </div>
    `;
  }

  function renderPlanView() {
    const days = weekDays();
    return `
      <div class="plan-layout">
        <section class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">一周菜单</div>
              <div class="subtle">${formatDate(days[0])} - ${formatDate(days[6])}</div>
            </div>
            <div class="toolbar">
              <button class="secondary" type="button" data-action="clear-plan">清空</button>
              <button class="primary" type="button" data-action="generate-plan">生成</button>
            </div>
          </div>
          <div class="week-grid">
            ${days.map(renderPlanDay).join("")}
          </div>
        </section>
        <aside class="panel">
          <div class="panel-header">
            <span class="panel-title">采购清单</span>
            <span class="subtle">${plannedDishes().length} 个菜</span>
          </div>
          ${renderShoppingList()}
        </aside>
      </div>
    `;
  }

  function renderPlanDay(date) {
    const entry = state.plan.find((item) => item.date === date);
    return `
      <div class="plan-day">
        <div class="day-label">
          <strong>${escapeHtml(formatWeekday(date))}</strong>
          ${escapeHtml(formatShortDate(date))}
        </div>
        <select class="plan-select" data-plan-date="${escapeAttr(date)}">
          <option value="">未安排</option>
          ${state.dishes
            .map(
              (dish) => `
                <option value="${escapeAttr(dish.id)}" ${entry?.dishId === dish.id ? "selected" : ""}>
                  ${escapeHtml(dish.name)}
                </option>
              `,
            )
            .join("")}
        </select>
        <button class="ghost" type="button" data-action="remove-plan-day" data-date="${escapeAttr(date)}">移除</button>
      </div>
    `;
  }

  function renderShoppingList() {
    const items = buildShoppingList();
    if (!items.length) {
      return `<div class="empty-state"><strong>没有待买食材</strong></div>`;
    }

    return `
      <div class="shopping-list">
        ${items
          .map(
            (item) => `
              <div class="shopping-item">
                <strong>${escapeHtml(item.name)}</strong>
                <span class="subtle">${escapeHtml(item.displayAmount || "按需")}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderFridgeView() {
    const suggestions = rankedDishesByFridge();
    return `
      <div class="fridge-layout">
        <section class="panel">
          <div class="panel-header">
            <span class="panel-title">冰箱食材</span>
            <span class="subtle">${state.fridge.length} 项</span>
          </div>
          <form class="inline-form" data-form="fridge">
            <input name="amount" placeholder="数量" />
            <input name="unit" placeholder="单位" />
            <input name="name" placeholder="食材" required />
            <input name="expires" type="date" />
            <button class="primary" type="submit">添加</button>
          </form>
          ${
            state.fridge.length
              ? `<div class="fridge-list">${state.fridge.map(renderFridgeItem).join("")}</div>`
              : `<div class="empty-state"><strong>冰箱还是空的</strong></div>`
          }
        </section>
        <aside class="panel">
          <div class="panel-header">
            <span class="panel-title">适合现在做</span>
          </div>
          ${
            suggestions.length
              ? `<div class="suggestion-list">${suggestions.slice(0, 8).map(renderSuggestion).join("")}</div>`
              : `<div class="empty-state"><strong>还没有可推荐的菜</strong></div>`
          }
        </aside>
      </div>
    `;
  }

  function renderFridgeItem(item) {
    const amount = [item.amount, item.unit].filter(Boolean).join(" ");
    return `
      <div class="fridge-item">
        <div class="fridge-main">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="subtle">${escapeHtml(amount || "按需")}${item.expires ? ` · ${escapeHtml(formatShortDate(item.expires))}` : ""}</div>
          </div>
          <button class="ghost" type="button" data-action="remove-fridge" data-id="${escapeAttr(item.id)}">移除</button>
        </div>
      </div>
    `;
  }

  function renderSuggestion(result) {
    const { dish, matched, missing, score } = result;
    return `
      <article class="suggestion-card">
        <div class="suggestion-head">
          <div>
            <strong>${escapeHtml(dish.name)}</strong>
            <div class="subtle">匹配 ${matched.length}/${dish.ingredients.length || 0} · ${score.toFixed(1)}</div>
          </div>
          <button class="secondary" type="button" data-action="add-today-plan" data-id="${escapeAttr(dish.id)}">今天做</button>
        </div>
        <div class="matched-missing">
          ${matched.map((name) => `<span class="match-pill">${escapeHtml(name)}</span>`).join("")}
          ${missing.slice(0, 4).map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("")}
        </div>
      </article>
    `;
  }

  function renderLogsView() {
    const logs = state.dishes
      .flatMap((dish) => dish.logs.map((log) => ({ ...log, dish })))
      .sort((a, b) => b.date.localeCompare(a.date));

    if (!logs.length) {
      return `
        <section class="panel">
          <div class="empty-state"><strong>还没有做饭记录</strong></div>
        </section>
      `;
    }

    return `
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">最近记录</span>
          <span class="subtle">${logs.length} 次</span>
        </div>
        <div class="recent-grid">
          ${logs
            .map(
              (log) => `
                <article class="log-card">
                  <div class="log-head">
                    <div>
                      <strong>${escapeHtml(log.dish.name)}</strong>
                      <div class="subtle">${escapeHtml(formatDate(log.date))} · ${Number(log.rating || 0)} 分</div>
                    </div>
                    <button class="ghost" type="button" data-action="select-dish" data-id="${escapeAttr(log.dish.id)}">查看</button>
                  </div>
                  ${log.notes ? `<p class="note-text">${escapeHtml(log.notes)}</p>` : ""}
                  ${log.photos?.length ? `<div class="photo-grid">${log.photos.slice(0, 3).map((photo) => `<img src="${escapeAttr(photo)}" alt="${escapeAttr(log.dish.name)} 记录照片" />`).join("")}</div>` : ""}
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function openDishDialog(dishId) {
    const dish = state.dishes.find((item) => item.id === dishId);
    const isEdit = Boolean(dish);
    const draft = dish || {
      name: "",
      category: "",
      tags: [],
      method: "",
      ingredients: [{ amount: "", unit: "", name: "" }],
      sources: [{ type: "视频", title: "", url: "", notes: "" }],
    };

    dialogHost.innerHTML = `
      <dialog class="dialog">
        <form class="dialog-shell" data-form="dish" data-id="${escapeAttr(dish?.id || "")}">
          <div class="dialog-header">
            <span class="dialog-title">${isEdit ? "编辑菜谱" : "新增菜谱"}</span>
            <button class="ghost" type="button" data-action="close-dialog">关闭</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-grid">
              <div class="form-field">
                <label for="dishName">菜名</label>
                <input id="dishName" name="name" value="${escapeAttr(draft.name)}" required />
              </div>
              <div class="form-field">
                <label for="dishCategory">分类</label>
                <input id="dishCategory" name="category" value="${escapeAttr(draft.category || "")}" />
              </div>
              <div class="form-field full">
                <label for="dishTags">标签</label>
                <input id="dishTags" name="tags" value="${escapeAttr((draft.tags || []).join(", "))}" />
              </div>
              <div class="form-field full">
                <label for="dishMethod">做法</label>
                <textarea id="dishMethod" name="method">${escapeHtml(draft.method || "")}</textarea>
              </div>
            </div>

            <section>
              <div class="panel-header">
                <span class="dialog-section-title">食材</span>
                <button class="secondary" type="button" data-action="add-ingredient-row">添加食材</button>
              </div>
              <div class="dynamic-list" data-list="ingredients">
                ${(draft.ingredients.length ? draft.ingredients : [{ amount: "", unit: "", name: "" }])
                  .map((ingredient) => ingredientRowTemplate(ingredient))
                  .join("")}
              </div>
            </section>

            <section>
              <div class="panel-header">
                <span class="dialog-section-title">来源</span>
                <button class="secondary" type="button" data-action="add-source-row">添加来源</button>
              </div>
              <div class="dynamic-list" data-list="sources">
                ${(draft.sources.length ? draft.sources : [{ type: "视频", title: "", url: "", notes: "" }])
                  .map((source) => sourceRowTemplate(source))
                  .join("")}
              </div>
            </section>
          </div>
          <div class="dialog-footer">
            <button class="ghost" type="button" data-action="close-dialog">取消</button>
            <button class="primary" type="submit">保存</button>
          </div>
        </form>
      </dialog>
    `;

    showDialog();
  }

  function ingredientRowTemplate(ingredient = { amount: "", unit: "", name: "" }) {
    return `
      <div class="field-row" data-row>
        <input name="ingredientAmount[]" value="${escapeAttr(ingredient.amount || "")}" placeholder="数量" />
        <input name="ingredientUnit[]" value="${escapeAttr(ingredient.unit || "")}" placeholder="单位" />
        <input name="ingredientName[]" value="${escapeAttr(ingredient.name || "")}" placeholder="食材" />
        <button class="ghost" type="button" data-action="remove-row">删除</button>
      </div>
    `;
  }

  function sourceRowTemplate(source = { type: "视频", title: "", url: "", notes: "" }) {
    return `
      <div class="field-row source-field-row" data-row>
        <select name="sourceType[]">
          ${["视频", "文章", "帖子", "其他"].map((type) => `<option value="${type}" ${source.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
        <input name="sourceTitle[]" value="${escapeAttr(source.title || "")}" placeholder="标题" />
        <input name="sourceUrl[]" value="${escapeAttr(source.url || "")}" placeholder="链接" />
        <button class="ghost" type="button" data-action="remove-row">删除</button>
        <input class="source-note-row" name="sourceNotes[]" value="${escapeAttr(source.notes || "")}" placeholder="备注" />
      </div>
    `;
  }

  function openLogDialog(dishId, logId) {
    const dish = state.dishes.find((item) => item.id === dishId);
    if (!dish) return;

    const log = dish.logs.find((item) => item.id === logId) || {
      id: "",
      date: todayIso(),
      rating: 4,
      notes: "",
      photos: [],
    };

    dialogHost.innerHTML = `
      <dialog class="dialog">
        <form class="dialog-shell" data-form="log" data-dish-id="${escapeAttr(dish.id)}" data-id="${escapeAttr(log.id)}">
          <div class="dialog-header">
            <span class="dialog-title">${escapeHtml(dish.name)} · ${log.id ? "编辑记录" : "新增记录"}</span>
            <button class="ghost" type="button" data-action="close-dialog">关闭</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-grid">
              <div class="form-field">
                <label for="logDate">日期</label>
                <input id="logDate" name="date" type="date" value="${escapeAttr(log.date)}" required />
              </div>
              <div class="form-field">
                <label>评分</label>
                <div class="rating-picker">
                  ${[1, 2, 3, 4, 5]
                    .map(
                      (rating) => `
                        <label>
                          <input type="radio" name="rating" value="${rating}" ${Number(log.rating) === rating ? "checked" : ""} />
                          <span>${rating}</span>
                        </label>
                      `,
                    )
                    .join("")}
                </div>
              </div>
              <div class="form-field full">
                <label for="logNotes">心得</label>
                <textarea id="logNotes" name="notes">${escapeHtml(log.notes || "")}</textarea>
              </div>
              <div class="form-field full">
                <label for="logPhotos">图片</label>
                <input id="logPhotos" name="photos" type="file" accept="image/*" multiple />
              </div>
            </div>
            ${
              log.photos?.length
                ? `
                  <section>
                    <span class="dialog-section-title">已有图片</span>
                    <div class="photo-grid">
                      ${log.photos
                        .map(
                          (photo, index) => `
                            <div class="existing-photo">
                              <img src="${escapeAttr(photo)}" alt="${escapeAttr(dish.name)} 记录照片" />
                              <label>
                                <input type="checkbox" name="keepPhoto" value="${index}" checked />
                                保留
                              </label>
                            </div>
                          `,
                        )
                        .join("")}
                    </div>
                  </section>
                `
                : ""
            }
          </div>
          <div class="dialog-footer">
            <button class="ghost" type="button" data-action="close-dialog">取消</button>
            <button class="primary" type="submit">保存</button>
          </div>
        </form>
      </dialog>
    `;

    showDialog();
  }

  function saveDishFromForm(form) {
    const id = form.dataset.id || makeId();
    const existing = state.dishes.find((dish) => dish.id === id);
    const ingredients = readRows(form, "ingredientName[]").map((name, index) => ({
      id: existing?.ingredients[index]?.id || makeId(),
      amount: readRows(form, "ingredientAmount[]")[index] || "",
      unit: readRows(form, "ingredientUnit[]")[index] || "",
      name,
    })).filter((ingredient) => ingredient.name);

    const sourceTypes = readRows(form, "sourceType[]");
    const sourceTitles = readRows(form, "sourceTitle[]");
    const sourceUrls = readRows(form, "sourceUrl[]");
    const sourceNotes = readRows(form, "sourceNotes[]");
    const sources = sourceTypes
      .map((type, index) => ({
        id: existing?.sources[index]?.id || makeId(),
        type,
        title: sourceTitles[index] || "",
        url: normalizeSourceUrl(sourceUrls[index] || ""),
        notes: sourceNotes[index] || "",
      }))
      .filter((source) => source.title || source.url || source.notes);

    const dish = {
      id,
      name: form.elements.name.value.trim(),
      category: form.elements.category.value.trim(),
      tags: splitList(form.elements.tags.value),
      method: form.elements.method.value.trim(),
      ingredients,
      sources,
      logs: existing?.logs || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!dish.name) return;

    if (existing) {
      state.dishes = state.dishes.map((item) => (item.id === id ? dish : item));
    } else {
      state.dishes.unshift(dish);
    }

    ui.selectedDishId = id;
    saveState();
    closeDialog();
    render();
  }

  async function saveLogFromForm(form) {
    const dish = state.dishes.find((item) => item.id === form.dataset.dishId);
    if (!dish) return;

    const existing = dish.logs.find((log) => log.id === form.dataset.id);
    const keptIndexes = Array.from(form.querySelectorAll('input[name="keepPhoto"]:checked')).map((input) => Number(input.value));
    const keptPhotos = existing?.photos?.filter((_, index) => keptIndexes.includes(index)) || [];
    let newPhotos = [];
    try {
      newPhotos = await compressImages(Array.from(form.elements.photos.files || []));
    } catch {
      window.alert("图片上传失败，这次记录还没有保存。可以稍后重试，或先不选图片保存。");
      return;
    }
    const log = {
      id: existing?.id || makeId(),
      date: form.elements.date.value,
      rating: Number(form.elements.rating.value || 4),
      notes: form.elements.notes.value.trim(),
      photos: [...keptPhotos, ...newPhotos],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      dish.logs = dish.logs.map((item) => (item.id === log.id ? log : item));
    } else {
      dish.logs.unshift(log);
    }

    dish.updatedAt = new Date().toISOString();
    saveState();
    closeDialog();
    render();
  }

  function saveFridgeFromForm(form) {
    const name = form.elements.name.value.trim();
    if (!name) return;

    state.fridge.unshift({
      id: makeId(),
      amount: form.elements.amount.value.trim(),
      unit: form.elements.unit.value.trim(),
      name,
      expires: form.elements.expires.value,
      createdAt: new Date().toISOString(),
    });

    form.reset();
    saveState();
    render();
  }

  function deleteDish(id) {
    const dish = state.dishes.find((item) => item.id === id);
    if (!dish || !window.confirm(`删除「${dish.name}」？`)) return;
    state.dishes = state.dishes.filter((item) => item.id !== id);
    state.plan = state.plan.filter((item) => item.dishId !== id);
    ui.selectedDishId = state.dishes[0]?.id || null;
    saveState();
    render();
  }

  function deleteLog(dishId, logId) {
    const dish = state.dishes.find((item) => item.id === dishId);
    const log = dish?.logs.find((item) => item.id === logId);
    if (!dish || !log || !window.confirm("删除这次记录？")) return;
    dish.logs = dish.logs.filter((item) => item.id !== logId);
    dish.updatedAt = new Date().toISOString();
    saveState();
    render();
  }

  function generateWeekPlan() {
    const days = weekDays();
    const ranked = rankedDishesByFridge();
    const source = ranked.length
      ? ranked.map((item) => item.dish)
      : [...state.dishes].sort((a, b) => (averageRating(b) || 0) - (averageRating(a) || 0));

    if (!source.length) return;

    const picks = [];
    for (let index = 0; index < days.length; index += 1) {
      const candidate = source.find((dish) => !picks.includes(dish.id)) || source[index % source.length];
      picks.push(candidate.id);
    }

    state.plan = days.map((date, index) => ({ date, dishId: picks[index] }));
    saveState();
  }

  function setPlanDay(date, dishId) {
    state.plan = state.plan.filter((item) => item.date !== date);
    if (dishId) state.plan.push({ date, dishId });
    saveState();
  }

  function buildShoppingList() {
    const fridgeNames = state.fridge.map((item) => normalize(item.name));
    const buckets = new Map();

    plannedDishes().forEach((dish) => {
      dish.ingredients.forEach((ingredient) => {
        if (!ingredient.name || fridgeNames.includes(normalize(ingredient.name))) return;
        const key = `${normalize(ingredient.name)}|${normalize(ingredient.unit)}`;
        const existing = buckets.get(key) || {
          name: ingredient.name,
          unit: ingredient.unit,
          numericAmount: 0,
          textAmounts: [],
          hasNumeric: false,
        };

        const amount = Number(ingredient.amount);
        if (ingredient.amount && Number.isFinite(amount)) {
          existing.numericAmount += amount;
          existing.hasNumeric = true;
        } else if (ingredient.amount) {
          existing.textAmounts.push(ingredient.amount);
        }

        buckets.set(key, existing);
      });
    });

    return Array.from(buckets.values())
      .map((item) => {
        const amounts = [];
        if (item.hasNumeric) amounts.push(trimNumber(item.numericAmount));
        amounts.push(...item.textAmounts);
        const amountText = amounts.join(" + ");
        return {
          name: item.name,
          displayAmount: [amountText, item.unit].filter(Boolean).join(" "),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  function rankedDishesByFridge() {
    const fridgeNames = state.fridge.map((item) => normalize(item.name));
    return state.dishes
      .map((dish) => {
        const ingredientNames = dish.ingredients.map((ingredient) => ingredient.name).filter(Boolean);
        const matched = ingredientNames.filter((name) => fridgeNames.includes(normalize(name)));
        const missing = ingredientNames.filter((name) => !fridgeNames.includes(normalize(name)));
        const matchRatio = ingredientNames.length ? matched.length / ingredientNames.length : 0;
        const ratingBonus = (averageRating(dish) || 3) / 5;
        const recencyPenalty = cookedWithinDays(dish, 3) ? 0.45 : 0;
        return {
          dish,
          matched,
          missing,
          score: matchRatio * 4 + ratingBonus - recencyPenalty,
        };
      })
      .filter((result) => result.dish.ingredients.length || result.score > 0)
      .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
  }

  function plannedDishes() {
    return state.plan
      .map((entry) => state.dishes.find((dish) => dish.id === entry.dishId))
      .filter(Boolean);
  }

  function getSelectedDish() {
    return state.dishes.find((dish) => dish.id === ui.selectedDishId) || state.dishes[0];
  }

  function getFilteredDishes() {
    const query = normalize(ui.search);
    const dishes = [...state.dishes].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    if (!query) return dishes;
    return dishes.filter((dish) => normalize(searchableDishText(dish)).includes(query));
  }

  function searchableDishText(dish) {
    return [
      dish.name,
      dish.category,
      ...dish.tags,
      ...dish.ingredients.map((ingredient) => ingredient.name),
      ...dish.sources.flatMap((source) => [source.title, source.url, source.notes]),
      dish.method,
    ].join(" ");
  }

  async function init() {
    render();
    try {
      state = await loadState();
      ui.selectedDishId = state.dishes[0]?.id || null;
      ui.error = "";
    } catch {
      state = structuredClone(defaultState);
      ui.error = "加载失败，先显示空菜谱";
    } finally {
      ui.loading = false;
      render();
    }
  }

  async function loadState() {
    const response = await fetch(STATE_ENDPOINT, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("Failed to load state");
    const parsed = await response.json();
    return normalizeState(parsed);
  }

  function normalizeState(parsed) {
    try {
      if (!parsed || !Array.isArray(parsed.dishes)) return structuredClone(defaultState);
      return {
        ...structuredClone(defaultState),
        ...parsed,
        dishes: parsed.dishes.map(normalizeDish),
        fridge: Array.isArray(parsed.fridge) ? parsed.fridge : [],
        plan: Array.isArray(parsed.plan) ? parsed.plan : [],
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function normalizeDish(dish) {
    return {
      id: dish.id || makeId(),
      name: dish.name || "未命名菜",
      category: dish.category || "",
      tags: Array.isArray(dish.tags) ? dish.tags : [],
      method: dish.method || "",
      ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
      sources: Array.isArray(dish.sources) ? dish.sources : [],
      logs: Array.isArray(dish.logs) ? dish.logs : [],
      createdAt: dish.createdAt || new Date().toISOString(),
      updatedAt: dish.updatedAt || new Date().toISOString(),
    };
  }

  function saveState() {
    const snapshot = JSON.stringify(state);
    saveQueue = saveQueue
      .then(async () => {
        const response = await fetch(STATE_ENDPOINT, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: snapshot,
        });
        if (!response.ok) throw new Error("Failed to save state");
        ui.error = "";
      })
      .catch(() => {
        ui.error = "保存到云端失败，请稍后重试";
        render();
      });
    return saveQueue;
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eat-today-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.dishes)) {
      window.alert("导入文件格式不正确");
      return;
    }
    if (!window.confirm("导入会覆盖当前本地数据，继续？")) return;
    state = {
      ...structuredClone(defaultState),
      ...parsed,
      dishes: parsed.dishes.map(normalizeDish),
      fridge: Array.isArray(parsed.fridge) ? parsed.fridge : [],
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
    };
    ui.selectedDishId = state.dishes[0]?.id || null;
    await saveState();
    render();
  }

  function showDialog() {
    const dialog = dialogHost.querySelector("dialog");
    dialog.addEventListener("cancel", closeDialog);
    dialog.showModal();
  }

  function closeDialog() {
    const dialog = dialogHost.querySelector("dialog");
    if (dialog?.open) dialog.close();
    dialogHost.innerHTML = "";
  }

  async function compressImages(files) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return [];

    const blobs = await Promise.all(images.map(compressImage));
    const formData = new FormData();
    blobs.forEach((blob, index) => {
      const original = images[index];
      formData.append("photos", blob, fileNameForUpload(original, blob.type));
    });

    const response = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error("Failed to upload photos");
    const result = await response.json();
    return (result.uploads || []).map((upload) => upload.url).filter(Boolean);
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const maxSide = 1280;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Image compression failed"));
            },
            "image/jpeg",
            0.78,
          );
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function fileNameForUpload(file, type) {
    const base = String(file.name || "photo").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
    if (base) return base;
    if (type === "image/jpeg") return "photo.jpg";
    if (type === "image/png") return "photo.png";
    if (type === "image/webp") return "photo.webp";
    return "photo";
  }

  function readRows(form, name) {
    return Array.from(form.querySelectorAll(`[name="${name}"]`)).map((input) => input.value.trim());
  }

  function averageRating(dish) {
    if (!dish.logs.length) return 0;
    const total = dish.logs.reduce((sum, log) => sum + Number(log.rating || 0), 0);
    return total / dish.logs.length;
  }

  function latestLog(dish) {
    return sortLogs(dish.logs)[0];
  }

  function latestPhoto(dish) {
    return latestLog(dish)?.photos?.[0] || "";
  }

  function sortLogs(logs) {
    return [...logs].sort((a, b) => b.date.localeCompare(a.date));
  }

  function cookedWithinDays(dish, days) {
    const latest = latestLog(dish);
    if (!latest) return false;
    const age = (new Date(todayIso()) - new Date(latest.date)) / 86400000;
    return age >= 0 && age <= days;
  }

  function totalLogs() {
    return state.dishes.reduce((sum, dish) => sum + dish.logs.length, 0);
  }

  function weekDays() {
    const start = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return toLocalIso(date);
    });
  }

  function todayIso() {
    return toLocalIso(new Date());
  }

  function toLocalIso(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${iso}T00:00:00`));
  }

  function formatShortDate(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    }).format(new Date(`${iso}T00:00:00`));
  }

  function formatWeekday(iso) {
    return new Intl.DateTimeFormat("zh-CN", {
      weekday: "long",
    }).format(new Date(`${iso}T00:00:00`));
  }

  function splitList(value) {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function trimNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function makeId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function initialOf(value) {
    return String(value || "菜").trim().slice(0, 1) || "菜";
  }

  function safeUrl(value) {
    const normalized = normalizeSourceUrl(value);
    try {
      const url = new URL(normalized);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch {
      return "";
    }
    return "";
  }

  function normalizeSourceUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
