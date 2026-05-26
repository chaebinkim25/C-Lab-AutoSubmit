// src/data/tasks.ts

export interface Task {
    task_id: string;
    skeleton_code: string;
}

const TASKS_DATA: { tasks: Task[] } = {
    "tasks": [
        {
            "skeleton_code": `
/* 포장 타입 만들기.
 * 
 * enum 타입은 다음과 같은 형식으로 만듭니다. 
 * 
 * enum 상수종류이름 {
 *      첫번째상수이름,
 *      두번째상수이름,
 *      세번째상수이름
 * }
 * 
 * struct 타입은 다음과 같은 형식으로 만듭니다. 
 * 
 * struct 포장방법이름 {
 *      첫번째멤버타입 첫번째멤버이름;
 *      두번째멤버타입 두번째멤버이름;
 *      세번째멤버타입 세번쨰멤버이름;
 * }
 * 
 * to-do: 포장방법을 하나 만들어보세요.
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part0"
        },

        {
            "skeleton_code": `
/* 포장 타입 상자 만들기.
 * 
 * int 타입 상자는 int x = 0; 형식으로 만듭니다. 
 * char 타입 상자는 char y = 0; 형식으로 만듭니다. 
 * 
 * 포장 타입 상자는 struct 포장방법 z = { 0 }; 형식으로 만듭니다. 
 * 포장 타입 상자를 만들 때 주의할 점은, 포장방법에 대한 구체적인 내용이 앞에 적혀있어야 한다는 것입니다.
 * 
 * 보통, 포장방법은 소스파일 전체에서 쓰기 때문에, 앞쪽에 적습니다.
 * 
 * to-do: 포장방법을 하나 만들고, main 함수에서 해당 포장타입의 상자를 만들어보세요.
 */

int main(void)
{
        return 0;
}            `,
            "task_id": "lab12_part1"
        },

        {
            "skeleton_code": `
/* 포장 타입 상자의 멤버에 접근하기.
 * 
 * 포장 타입 상자의 멤버는 상자이름 . 멤버이름 형식으로 씁니다. 
 * 
 * to-do: 포장 타입 상자의 멤버에 값을 저장하고, 값을 읽어보세요.
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part2"
        },

        {
            "skeleton_code": `
/* 포장 타입 상자의 주소 저장하기.
 * 
 * int 타입 상자나 char 타입 상자에서 주소는 & 상자이름 형식으로 씁니다.
 * 포장 타입 상자의 주소도 똑같이 & 상자이름으로 구할 수 있습니다.
 * 
 * int 타입 상자의 주소를 저장할 주소 상자는 int * 주소상자이름 ; 형식으로 만듭니다.
 * char 타입 상자의 주소를 저장할 주소 상자는 char * 주소상자이름 ; 형식으로 만듭니다.
 * 포장 타입 상자의 주소를 저장할 주소 상자는 struct 포장방법 * 주소상자이름 ; 형식으로 만듭니다.
 * 
 * to-do: 포장 타입 상자의 주소를 구하고, 적절한 상자를 만들어서 저장해보세요.
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part3"
        },

        {
            "skeleton_code": `
/* 포장 타입 상자 주소에서 바로 멤버 쓰기 
 * 
 * 포장 타입 상자 주소에서 멤버를 구할 때는 포장상자주소 -> 멤버이름 형식으로 씁니다. 
 * 
 * to-do: -> 연산자를 써서 포장 타입 상자의 멤버에 값을 저장하고, 값을 읽어보세요.
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part4"
        },

        {
            "skeleton_code": `
/* 포장 타입 상자 주소 멤버 
 * 
 * 포장 타입을 만들 때, 해당 포장 타입의 주소를 멤버로 쓸 수 있습니다. 
 * 
 * to-do: 포장 타입을 만들면서 해당 포장 타입의 주소를 멤버로 써보세요. 
 * to-do: 포장 타입의 상자를 만들고, 주소 멤버의 초기값으로 상자의 주소를 적어보세요. 
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part5"
        },

        {
            "skeleton_code": `
/* 단방향 원형 링크드 리스트
 * 
 * 모든 노드들이 다음 노드를 가리키고, 마지막 노드가 처음 노드를 가리키는 구조를 단방향 원형 링크드 리스트라고 합니다. 
 * 
 * to-do: 다음과 같이 node_add 함수를 구현해보세요.
 * void node_add(struct node *new, struct node *prev);
 * 단방향 원형 링크드 리스트의 구성원인 prev 노드의 다음 자리에 new 노드를 추가해서 단방향 원형 링크드 리스트 특성을 유지하기.
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part6"
        },

        {
            "skeleton_code": `
/* 노드에 데이터 붙이기
 * 
 * 노드와 데이터를 포장해서 새로운 포장 타입을 만들면, 
 * 링크드 리스트에 있는 노드로부터 해당하는 데이터를 얻을 수 있습니다. 
 * 
 * to-do: 노드와 데이터를 포장해서 포장 타입을 만들어보세요. 노드 상자 주소로부터 해당 데이터를 꺼내보세요.
 * 
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part7"
        },

        {
            "skeleton_code": `
/* 단방향 원형 링크드 리스트 만들기
 * 
 * to-do: 단방향 원형 링크드 리스트를 만들어보세요. for로 모든 데이터에 대해 반복 작업을 해보세요.
 * 
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part8"
        },

        {
            "skeleton_code": `
/* 단방향 원형 링크드 리스트에서 노드 삭제하기
 * 
 * to-do: 단방향 원형 링크드 리스트에서 노드를 삭제해보세요.
 * 
 */

int main(void)
{
        return 0;
}
            `,
            "task_id": "lab12_part9"
        }

    ]
};

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        let chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return Math.abs(hash);
}

function mulberry32(a: number) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function getSeededTasks(studentNumber: string, studentName: string): Task[] {
    return TASKS_DATA.tasks.map(task => {
        const seedString = `${studentNumber}_${task.task_id}`;
        const seed = hashCode(seedString);
        const randomFn = mulberry32(seed);

        const injectedCode = task.skeleton_code.replace(/\{\{RAND_(\d+)_(\d+)\}\}/g, (match, minStr, maxStr) => {
            let minVal = parseInt(minStr, 10);
            let maxVal = parseInt(maxStr, 10);
            if (minVal > maxVal) {
                const temp = minVal;
                minVal = maxVal;
                maxVal = temp;
            }
            const randInt = Math.floor(randomFn() * (maxVal - minVal + 1)) + minVal;
            return randInt.toString();
        });

        const header = `/*\n * Student ID: ${studentNumber}\n * Name: ${studentName}\n */\n`;
        const finalSkeleton = header + injectedCode;

        return {
            ...task,
            skeleton_code: finalSkeleton
        };
    });
}
