// src/data/tasks.ts

export interface Task {
    title: string;
    description: string;
    skeleton_code: string;
    task_id: string;
}

const TASKS_DATA: { tasks: Task[] } = {
    "tasks": [
        {
            "title": "printf",
            "description": "화면에 출력하기",            
            "skeleton_code": `
/* printf
 * 
 * printf(포맷문장, ...)은 0개 이상의 데이터 ...을 포맷 문장에 맞춰서 텍스트로 변환하여 화면에 출력합니다.
 * printf는 데이터 없이 문장을 출력하는 데에도 종종 쓰입니다.
 * 
 * 문제: printf로 Hello, world~를 화면에 출력해보세요.
 * 
 */

#include <stdio.h>

int main(void)
{
        /* to-do: printf로 "Hello, world~"를 화면에 출력해보세요. */

        return 0;
}
`,
            "task_id": ""
        },
        {
            "title": "fprintf와 stdout",
            "description": "화면에 출력하기",                        
            "skeleton_code": `
/* fprintf와 stdout
 * 
 * fprintf를 쓰면 파일에 printf를 할 수 있습니다.
 * 
 * fprintf를 할 때 화면을 의미하는 stdout을 파일 주소 자리에 쓰면 printf와 같은 효과가 납니다. 
 * 
 * 문제: fprintf와 stdout을 써서 화면에 Hello, world^^를 출력해보세요.
 * 
 */

#include <stdio.h>

int main(void)
{
        /* to-do: fprintf와 stdout으로 "Hello, world^^"를 화면에 출력해보세요. */

        return 0;
}
    `,
            "task_id": ""
        },
        {
            "title": "fopen과 fclose",
            "description": "파일 만들어서 열기",                        
            "skeleton_code": `
/* fopen과 fclose
 * 
 * fopen은 파일을 읽기 또는 쓰기 모드로 여는 함수입니다. 결과값으로 FILE * 타입의 파일 메타데이터 주소를 얻습니다. 
 * 작업이 끝난 다음에는 fclose를 해서 파일을 닫습니다.
 * 
 * 문제: fopen으로 hello.txt 파일을 열어서 파일에 Hello, world:)를 출력해보세요.
 */

#include <stdio.h>

int main(void)
{
        /* to-do: fopen으로 hello.txt 파일을 w 모드로 열어보세요 */

        /* to-do: 파일 열기에 문제가 있었으면 에러 메시지를 출력하고 프로그램을 종료해보세요 */

        /* to-do: fprintf로 파일에 "Hello, world:)"를 출력해보세요 */

        /* to-do: fclose로 파일을 닫아보세요 */

        return 0;
}
    `,
            "task_id": ""
        },
        {
            "title": "fgetc와 fputc",
            "description": "파일에서 글자 읽고 쓰기",                        
            "skeleton_code": `
/* fgetc와 fputc
 * 
 * fgetc 함수를 쓰면 파일에서 글자 하나를 읽을 수 있습니다. 더 이상 읽을 글자가 없거나 에러가 발생하면 EOF가 반환됩니다. 
 *
 * fputc 함수를 쓰면 파일에 글자 하나를 쓸 수 있습니다. 에러가 발생하면 EOF가 반환됩니다.
 *
 * 문제: fopen으로 hello.txt 파일을 읽기 모드로 열고, hello2.txt 파일을 쓰기 모드로 열어보세요. 
 *      그리고 hello.txt의 모든 내용을 hello2.txt에 복사해보세요.
 */

#include <stdio.h>

int main(void)
{
        /* to-do: fopen으로 hello.txt 파일을 r 모드로 열어보세요 */

        /* to-do: 파일 열기에 문제가 있었으면 에러 메시지를 출력하고 프로그램을 종료해보세요 */

        /* to-do: fopen으로 hello2.txt 파일을 w 모드로 열어보세요 */

        /* to-do: 파일 열기에 문제가 있었으면 hello.txt를 닫고, 에러 메시지를 출력하고, 프로그램을 종료해보세요 */

        /* to-do: 임시로 글자를 저장할 int 상자를 만들어보세요 */

        /* to-do: while을 써서 hello.txt에서 글자가 읽어지면 hello2.txt에 저장해보세요 */

        /* to-do: fclose로 파일들을 닫아보세요 */

        return 0;
}
    `,
            "task_id": ""
        },
        {
            "title": "stdin",
            "description": "키보드에서 글자를 읽어서 파일에 쓰기",                        
            "skeleton_code": `
/* stdin
 * 
 * fgetc를 할 때 키보드를 의미하는 stdin을 파일 주소 자리에 쓰면 getchar와 같은 효과가 납니다. 
 *
 * 문제: note.txt 파일을 쓰기 모드로 열고, 키보드 입력을 받아서 전부 파일에 저장해보세요. 
 *      예외적으로 ':' 글자는 파일에 저장하지 않고, ":w"가 확인되면 입력을 그만 받고 파일을 닫아보세요.
 * 
 * 힌트: 상태를 저장하는 상자를 만들어서, 입력된 글자가 ':'면 파일에 글자를 저장하는 대신 상태를 바꿔보세요. 
 */

#include <stdio.h>

int main(void)
{
        /* to-do: fopen으로 note.txt 파일을 w 모드로 열어보세요 */

        /* to-do: 파일 열기에 문제가 있었으면 에러 메시지를 출력하고 프로그램을 종료해보세요 */

        /* to-do: 이전에 입력받은 키가 :인지 확인하는 colon_state 상자를 만들고 거짓으로 초기화해보세요 */

        /* to-do: 임시로 글자를 저장할 int 상자를 만들어보세요 */

        /* to-do: while을 써서 키보드에서 글자가 읽어지면 반복해보세요 */

                /* to-do: 입력된 글자가 :이면, colon_state에 참을 저장하고 다음 반복으로 넘어가보세요 */

                /* to-do: colon_state가 참이고, 입력된 글자가 w면 반복을 종료해보세요 */

                /* to-do: colon_state가 참인데 입력된 글자가 w가 아니면 colon_state를 거짓으로 바꿔보세요 */

                /* to-do: 입력된 글자를 파일에 저장해보세요 */

        /* to-do: fclose로 파일을 닫아보세요 */

        return 0;
}
    `,
            "task_id": ""
        },
        {
            "title": "brute-force",
            "description": "코딩테스트 two sum 문제 풀기",                        
            "skeleton_code": `
/* brute-force
 * 
 * brute-force 방법은 가능한 모든 경우를 확인해보는 방법입니다.
 *
 * 문제: brute-force 방법을 써서 nums 배열에 저장된 여러 숫자들 중에 합계가 target인 숫자 두개를 찾아보세요.
 * 
 * 힌트: nums의 인덱스를 i와 j로 반복할 때, i == j인 경우는 같은 숫자를 의미하므로 제외해보세요.
 */
#include <stdio.h>

int main(void)
{
        int nums[99] = {3, 4, 5, 5, 12, 13, 7, 24, 25, 8, 15, 17, 9, 40, 41, 11, 60, 61, 12, 35, 37, 13, 84, 85, 15, 112, 113, 16, 63, 65, 17, 144, 145, 19, 180, 181, 20, 21, 29, 20, 99, 101, 21, 220, 221, 23, 264, 265, 24, 143, 145, 25, 312, 313, 27, 364, 365, 28, 45, 53, 28, 195, 197, 33, 56, 65, 36, 77, 85, 39, 80, 89, 44, 117, 125, 48, 55, 73, 51, 140, 149, 52, 165, 173, 57, 176, 185, 60, 91, 109, 65, 72, 97, 69, 260, 269, 75, 308, 317};

        int nums_size = 99;

        int target = 568;

        /* to-do: for로 i를 0부터 nums_size - 1까지 반복해보세요 */

                /* to-do: for로 j를 0부터 nums_size - 1까지 반복해보세요 */

                        /* to-do: j == i인 경우 다음 j로 넘어가보세요 */

                        /* nums[i] + nums[j] == target이면 두 숫자를 printf로 출력하고 프로그램을 종료해보세요 */

        return 0;
}
    `,
            "task_id": ""
        },
        {
            "title": "table",
            "description": "코딩테스트 two sum 문제 풀기",                        
            "skeleton_code": `
/* table
 * 
 * table 방법은 숫자를 기록해서 빨리 찾을 수 있는 방법입니다.
 *
 * 문제: table 방법을 써서 nums 배열에 저장된 여러 숫자들 중에 합계가 target인 숫자 두개를 찾아보세요.
 * 
 * 힌트: 해당 값이 nums에 몇개 있는지를 table에 저장해보세요.
 *       그리고 숫자들에 대해서 target - 숫자가 table에 있는지 확인해보세요.
 */
#include <stdio.h>

int main(void)
{
        int nums[99] = {3, 4, 5, 5, 12, 13, 7, 24, 25, 8, 15, 17, 9, 40, 41, 11, 60, 61, 12, 35, 37, 13, 84, 85, 15, 112, 113, 16, 63, 65, 17, 144, 145, 19, 180, 181, 20, 21, 29, 20, 99, 101, 21, 220, 221, 23, 264, 265, 24, 143, 145, 25, 312, 313, 27, 364, 365, 28, 45, 53, 28, 195, 197, 33, 56, 65, 36, 77, 85, 39, 80, 89, 44, 117, 125, 48, 55, 73, 51, 140, 149, 52, 165, 173, 57, 176, 185, 60, 91, 109, 65, 72, 97, 69, 260, 269, 75, 308, 317};

        int nums_size = 99;

        int target = 568;

        /* to-do: 366칸 크기의 묶음 상자 table을 만들고, 모든 상자를 0으로 초기화해보세요 */

        /* to-do: for로 i를 0부터 nums_size - 1까지 반복해보세요 */

                /* table[nums[i]]의 값을 1 증가시켜보세요 */

        /* to-do: for로 i를 0부터 nums_size - 1까지 반복해보세요 */

                /* to-do: target - nums[i]가 0부터 365 범위 바깥이면 다음 반복으로 넘어가보세요 */

                /* to-do: target - nums[i] == nums[i]인 경우, table[target - nums[i]] >= 2이면 두 숫자를 printf로 출력하고 프로그램을 종료해보세요 */

                /* to-do: target - nums[i] != nums[i]인 경우, table[target - nums[i]] >= 1이면 두 숫자를 printf로 출력하고 프로그램을 종료해보세요 */

        return 0;
}
    `,
            "task_id": ""
        },
        {
            "title": "설문",
            "description": "",
            "skeleton_code": `
/* 
 * to-do: 오늘 수업 분량은 적절했나요? 
 * 
 */

/* 
 * to-do: 추가적으로 원하는 설명이나 개선 사항이 있으면 간단히 적어주세요. 
 * 
 */
    `,
            "task_id": ""
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
    return TASKS_DATA.tasks.map((task, index) => {
        const properTaskId = task.task_id || `task_${index + 1}`;

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

        return {
            ...task,
            task_id: properTaskId,
            skeleton_code: injectedCode
        };
    });
}
