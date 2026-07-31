# Стандартный коммит слияния

git checkout main
git pull origin main
git merge cursor/add-n8n-base-workflow-8397
git push origin main

# Слияние с явным коммитом слияния

git checkout main
git pull origin main
git merge --no-ff cursor/add-n8n-base-workflow-8397 \
 -m «2026-07-31 cursor merge bilingual n8n workflow»
git push origin main

# Только быстрый переход

# Завершится с ошибкой, если ветки разошлись:

git checkout main
git pull origin main
git merge --ff-only cursor/add-n8n-base-workflow-8397
git push origin main

# Слияние с слиянием в одну фиксацию

# Объединяет ветку в одну фиксацию:

git checkout main
git pull origin main
git merge --squash cursor/add-n8n-base-workflow-8397
git commit -m «2026-07-31 cursor add bilingual n8n base workflow»
git push origin main

# Ребаз, затем быстрый переход вперёд

# Создаёт линейную историю:

git checkout cursor/add-n8n-base-workflow-8397
git fetch origin main
git rebase origin/main
git checkout main
git pull origin main
git merge --ff-only cursor/add-n8n-base-workflow-8397
git push origin main

# Если перебазированную функциональную ветку также необходимо обновить удалённо:

git push --force-with-lease origin cursor/add-n8n-base-workflow-8397

# Выбрать только эту фиксацию

git checkout main
git pull origin main
git cherry-pick 0f8ed99
git push origin main

# Слияние напрямую из удалённой ветки

git checkout main
git pull origin main
git fetch origin cursor/add-n8n-base-workflow-8397
git merge --no-ff origin/cursor/add-n8n-base-workflow-8397
git push origin main

# Устранение конфликтов

git status

# Редактирование файлов с конфликтами

git add <resolved-files>
git commit
git push origin main
Во время ребейза:

git add <resolved-files>
git rebase --continue

# Отмена операций:

git merge --abort
git rebase --abort
git cherry-pick --abort

# Удаление слиянной ветки

git branch -d cursor/add-n8n-base-workflow-8397
git push origin --delete cursor/add-n8n-base-workflow-8397

# Рекомендуется: объединить черновой PR с помощью «Squash and merge» или использовать приведённые выше команды squash.
